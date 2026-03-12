import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import { listAssetCardFieldsByAssetCard } from '../models/assetCards.js';
import { deleteRefNode, findNodeByRef, upsertRefNode } from '../models/nodes.js';
import {
  createAsset,
  deleteAsset,
  getAssetById,
  insertAssetEvent,
  listAssetEvents,
  listAssetsByOrganization,
  lockAssetForUpdate,
  updateAsset,
  updateAssetLocation,
  updateAssetState
} from '../models/assets.js';
import {
  buildLocalBucketPublicUrl,
  decodeBase64ImageDataUrl,
  deleteLocalBucketObjectByPublicUrl,
  isLocalBucketPublicUrl,
  parseLocalBucketObjectKeyFromPublicUrl,
  storeDataImageUrlInLocalBucket
} from '../services/localBucket.js';
import { parsePaginationQuery } from '../utils/pagination.js';
import {
  createAssetBomLine,
  deleteAssetBomLine,
  getAssetBomRollup,
  listAssetBomLines,
  updateAssetBomLine
} from '../models/assetBom.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

function buildAssetNodeMeta(asset) {
  return {
    location_id: asset.location_id ?? null,
    parent_asset_id: asset.parent_asset_id ?? null,
    asset_card_id: asset.asset_card_id ?? null,
    current_state: asset.current_state,
    runtime_meter_value: asset.runtime_meter_value ?? 0,
    runtime_meter_unit: asset.runtime_meter_unit ?? 'HOUR'
  };
}

function isPlainObject(value) {
  if (value == null) return false;
  if (typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  return true;
}

function normalizeFieldType(value) {
  if (value === 'text' || value === 'number' || value === 'boolean' || value === 'date') return value;
  return 'text';
}

function normalizeUnitId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeAssetImageUrl(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const localBucketObjectKey = parseLocalBucketObjectKeyFromPublicUrl(trimmed);
  if (localBucketObjectKey) return buildLocalBucketPublicUrl(localBucketObjectKey);

  const lower = trimmed.toLowerCase();
  if (lower.startsWith('data:image/')) return trimmed;
  if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed;

  return undefined;
}

function normalizeRuntimeMeterUnit(value) {
  return value === 'KM' ? 'KM' : 'HOUR';
}

async function listRuntimeUnitHierarchyMismatches(organizationId, { limit = 200 } = {}) {
  const baseQuery = db('assets as child')
    .join('assets as parent', function joinParent() {
      this.on('parent.id', '=', 'child.parent_asset_id').andOn('parent.organization_id', '=', 'child.organization_id');
    })
    .where({ 'child.organization_id': organizationId })
    .andWhereRaw(
      `
        (case when child.runtime_meter_unit = 'KM' then 'KM' else 'HOUR' end)
        <>
        (case when parent.runtime_meter_unit = 'KM' then 'KM' else 'HOUR' end)
      `
    );

  const [{ count }] = await baseQuery.clone().clearSelect().count({ count: 'child.id' });

  const rows = await baseQuery
    .clone()
    .select([
      'child.id as child_asset_id',
      'child.name as child_asset_name',
      'child.runtime_meter_unit as child_runtime_meter_unit',
      'parent.id as parent_asset_id',
      'parent.name as parent_asset_name',
      'parent.runtime_meter_unit as parent_runtime_meter_unit'
    ])
    .orderBy([
      { column: 'parent.id', order: 'asc' },
      { column: 'child.id', order: 'asc' }
    ])
    .limit(Math.max(1, Math.min(Number(limit) || 200, 1000)));

  return {
    totalCount: Number(count) || 0,
    rows: rows.map((row) => ({
      ...row,
      child_runtime_meter_unit: normalizeRuntimeMeterUnit(row.child_runtime_meter_unit),
      parent_runtime_meter_unit: normalizeRuntimeMeterUnit(row.parent_runtime_meter_unit)
    }))
  };
}

function mapAssetTypeFieldsToSchemaRows(rows) {
  return rows
    .map((row) => ({
      key: (row.name ?? '').trim(),
      label: (row.label ?? '').trim() || (row.name ?? '').trim(),
      type: normalizeFieldType(row.data_type),
      required: Boolean(row.required),
      unitId: normalizeUnitId(row.unit_id)
    }))
    .filter((row) => Boolean(row.key));
}

async function resolveAssetCardSchemaRows(organizationId, assetCardId) {
  const card = await db('asset_cards').where({ id: assetCardId, organization_id: organizationId }).first(['id', 'runtime_meter_unit']);
  if (!card) return { notFound: true };

  const fieldRows = await listAssetCardFieldsByAssetCard(organizationId, assetCardId);
  return {
    notFound: false,
    schemaRows: mapAssetTypeFieldsToSchemaRows(fieldRows),
    runtimeMeterUnit: card.runtime_meter_unit === 'KM' ? 'KM' : 'HOUR'
  };
}

function unwrapAttributeValue(raw) {
  if (!isPlainObject(raw)) return { value: raw, unitId: null };
  if ('value' in raw || 'unit_id' in raw || 'unitId' in raw) {
    return {
      value: 'value' in raw ? raw.value : null,
      unitId: normalizeUnitId('unit_id' in raw ? raw.unit_id : 'unitId' in raw ? raw.unitId : null)
    };
  }
  return { value: raw, unitId: null };
}

function hasValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function normalizeValueByType(value, type) {
  if (value == null) return null;

  if (type === 'text') {
    if (typeof value === 'string') return value.trim() ? value.trim() : null;
    return String(value);
  }

  if (type === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return undefined;
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  if (type === 'date') {
    if (typeof value !== 'string') return undefined;
    const text = value.trim();
    if (!text) return null;
    if (Number.isNaN(Date.parse(text))) return undefined;
    return text;
  }

  return value;
}

function normalizeAttributesBySchema(attributesJson, schemaRows) {
  if (schemaRows.length === 0) return { ok: true, value: attributesJson ?? null };

  if (attributesJson != null && !isPlainObject(attributesJson)) {
    return { ok: false, message: 'attributes_json must be an object for selected asset type fields' };
  }

  const source = isPlainObject(attributesJson) ? attributesJson : {};
  const byLowerKey = new Map(Object.entries(source).map(([key, value]) => [key.toLowerCase(), { key, value }]));
  const consumedKeys = new Set();
  const normalized = {};

  for (const field of schemaRows) {
    const found = byLowerKey.get(field.key.toLowerCase());
    if (found) consumedKeys.add(found.key);
    const parsed = unwrapAttributeValue(found ? found.value : null);
    const normalizedValue = normalizeValueByType(parsed.value, field.type);
    if (normalizedValue === undefined) {
      return { ok: false, message: `Invalid value type for attribute '${field.key}'` };
    }

    if (field.required && !hasValue(normalizedValue)) {
      return { ok: false, message: `Missing required attribute '${field.key}'` };
    }

    const resolvedUnit = field.unitId;
    if (resolvedUnit != null) normalized[field.key] = { value: normalizedValue, unit_id: resolvedUnit };
    else normalized[field.key] = normalizedValue;
  }

  const unknownKeys = Object.keys(source).filter((key) => !consumedKeys.has(key));
  if (unknownKeys.length > 0) {
    return { ok: false, message: `Unknown attribute keys: ${unknownKeys.join(', ')}` };
  }

  if (Object.keys(normalized).length === 0) return { ok: true, value: null };
  return { ok: true, value: normalized };
}

router.get('/organizations/:id/assets', (req, res) => {
  const organizationId = req.organizationId;

  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const parentAssetIdRaw = typeof req.query.parentAssetId === 'string' ? req.query.parentAssetId : undefined;
  const assetCardId = typeof req.query.assetCardId === 'string' ? req.query.assetCardId : undefined;
  const assetTypeId = typeof req.query.assetTypeId === 'string' ? req.query.assetTypeId : undefined;

  const parentAssetId = parentAssetIdRaw === undefined ? undefined : parentAssetIdRaw === 'null' ? null : Number(parentAssetIdRaw);
  const resolvedAssetCardId = assetCardId ?? assetTypeId;
  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 12, maxPageSize: 100 });
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const name = typeof req.query.name === 'string' ? req.query.name : undefined;
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const currentState = typeof req.query.currentState === 'string' ? req.query.currentState : undefined;
  const sortField = typeof req.query.sortField === 'string' ? req.query.sortField : undefined;
  const sortOrder = typeof req.query.sortOrder === 'string' ? req.query.sortOrder : undefined;

  return Promise.resolve()
    .then(() =>
      listAssetsByOrganization(organizationId, {
        locationId,
        parentAssetId,
        assetCardId: resolvedAssetCardId,
        q,
        name,
        code,
        currentState,
        sortField,
        sortOrder,
        page: pagination.enabled ? pagination.page : undefined,
        pageSize: pagination.enabled ? pagination.pageSize : undefined
      })
    )
    .then((result) => {
      if (pagination.enabled) return res.status(200).json({ assets: result.rows, pagination: result.pagination });
      return res.status(200).json({ assets: result });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch assets' }));
});

router.get('/organizations/:id/assets/runtime-unit-integrity', (req, res) => {
  const organizationId = req.organizationId;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  return Promise.resolve()
    .then(async () => {
      const { totalCount, rows } = await listRuntimeUnitHierarchyMismatches(organizationId, {
        limit: Number.isFinite(limitRaw) ? limitRaw : 200
      });
      return { totalCount, rows };
    })
    .then((result) =>
      res.status(200).json({
        ok: result.totalCount === 0,
        mismatchCount: result.totalCount,
        mismatches: result.rows
      })
    )
    .catch(() => res.status(500).json({ message: 'Failed to validate runtime unit integrity' }));
});

const runtimeAdjustmentSchema = z.object({
  asset_ids: z.array(z.number().int().positive()).min(1),
  delta: z.number().positive(),
  include_descendants: z.boolean().optional()
});

router.post('/organizations/:id/assets/runtime-adjustments', (req, res) => {
  const organizationId = req.organizationId;
  const parsed = runtimeAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  const requestedIds = Array.from(new Set(parsed.data.asset_ids.map((id) => Number(id))));
  const delta = Number(parsed.data.delta);
  const includeDescendants = parsed.data.include_descendants !== false;

  return Promise.resolve()
    .then(async () => {
      const result = await db.transaction(async (trx) => {
        let updatedIds = [];

        if (includeDescendants) {
          const updateResult = await trx.raw(
            `
              with recursive asset_tree as (
                select a.id, a.parent_asset_id
                from assets a
                where a.organization_id = ?
                  and a.id = any(?::int[])
                union all
                select child.id, child.parent_asset_id
                from assets child
                join asset_tree t on child.parent_asset_id = t.id
                where child.organization_id = ?
              ),
              target as (
                select distinct id from asset_tree
              )
              update assets a
              set runtime_meter_value = round((coalesce(a.runtime_meter_value, 0)::numeric + ?::numeric), 3),
                  updated_at = now()
              from target
              where a.organization_id = ?
                and a.id = target.id
              returning a.id
            `,
            [organizationId, requestedIds, organizationId, delta, organizationId]
          );
          updatedIds = (updateResult?.rows ?? []).map((row) => Number(row.id));
        } else {
          const updated = await trx('assets')
            .where({ organization_id: organizationId })
            .whereIn('id', requestedIds)
            .update({
              runtime_meter_value: trx.raw('round((coalesce(runtime_meter_value, 0)::numeric + ?::numeric), 3)', [delta]),
              updated_at: trx.fn.now()
            })
            .returning(['id']);
          updatedIds = updated.map((row) => Number(row.id));
        }

        if (updatedIds.length === 0) return { notFound: true };

        await trx.raw(
          `
            update nodes n
            set meta_json = jsonb_set(coalesce(n.meta_json, '{}'::jsonb), '{runtime_meter_value}', to_jsonb(a.runtime_meter_value), true),
                updated_at = now()
            from assets a
            where a.organization_id = ?
              and a.id = any(?::int[])
              and n.organization_id = a.organization_id
              and n.node_type = 'ASSET'
              and n.ref_table = 'assets'
              and n.ref_id = a.id::text
          `,
          [organizationId, updatedIds]
        );

        return { updatedIds };
      });

      return result;
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Assets not found' });
      return res.status(200).json({
        updated_count: result.updatedIds.length,
        asset_ids: result.updatedIds
      });
    })
    .catch(() => res.status(500).json({ message: 'Failed to apply runtime adjustment' }));
});

router.get('/organizations/:id/assets/:assetId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  return Promise.resolve()
    .then(() => getAssetById(organizationId, assetId))
    .then((asset) => {
      if (!asset) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ asset });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch asset' }));
});

const createSchema = z.object({
  location_id: z.number().int().positive(),
  parent_asset_id: z.number().int().positive().optional().nullable(),
  asset_card_id: z.number().int().positive().optional().nullable(),
  asset_type_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(1).max(64).optional().nullable(),
  name: z.string().min(1).max(255),
  runtime_meter_value: z.number().nonnegative().optional(),
  runtime_meter_unit: z.enum(['HOUR', 'KM']).optional(),
  image_url: z.string().max(4_000_000).optional().nullable(),
  attributes_json: z.unknown().optional().nullable()
});

router.post('/organizations/:id/assets', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      let attributesJson = parsed.data.attributes_json ?? null;
      let runtimeMeterUnit = parsed.data.runtime_meter_unit;
      let parentRuntimeMeterUnit = null;
      const imageUrl = normalizeAssetImageUrl(parsed.data.image_url);
      if (imageUrl === undefined) return { invalidImage: true };
      const shouldStoreImageInLocalBucket = typeof imageUrl === 'string' && imageUrl.toLowerCase().startsWith('data:image/');
      if (shouldStoreImageInLocalBucket && !decodeBase64ImageDataUrl(imageUrl)) return { invalidImage: true };

      const location = await db('locations').where({ id: parsed.data.location_id, organization_id: organizationId }).first(['id']);
      if (!location) return { notFoundLocation: true };

      if (parsed.data.parent_asset_id) {
        const parent = await db('assets')
          .where({ id: parsed.data.parent_asset_id, organization_id: organizationId })
          .first(['id', 'runtime_meter_unit']);
        if (!parent) return { notFoundParent: true };
        parentRuntimeMeterUnit = normalizeRuntimeMeterUnit(parent.runtime_meter_unit);
      }

      const resolvedAssetCardId = parsed.data.asset_card_id ?? parsed.data.asset_type_id ?? null;
      if (resolvedAssetCardId) {
        const resolvedType = await resolveAssetCardSchemaRows(organizationId, resolvedAssetCardId);
        if (resolvedType.notFound) return { notFoundType: true };

        const schemaRows = resolvedType.schemaRows;
        const normalizedAttr = normalizeAttributesBySchema(parsed.data.attributes_json ?? null, schemaRows);
        if (!normalizedAttr.ok) return { invalidAttributes: normalizedAttr.message };
        attributesJson = normalizedAttr.value;
        runtimeMeterUnit = resolvedType.runtimeMeterUnit;
      }

      const normalizedRuntimeMeterUnit = normalizeRuntimeMeterUnit(runtimeMeterUnit);
      if (parentRuntimeMeterUnit && normalizedRuntimeMeterUnit !== parentRuntimeMeterUnit) {
        return {
          parentRuntimeUnitMismatch: true,
          runtimeMeterUnit: normalizedRuntimeMeterUnit,
          parentRuntimeMeterUnit
        };
      }

      const asset = await db.transaction(async (trx) => {
        const created = await createAsset(trx, {
          organizationId,
          locationId: parsed.data.location_id,
          parentAssetId: parsed.data.parent_asset_id ?? null,
          assetCardId: resolvedAssetCardId,
          code: parsed.data.code ?? null,
          name: parsed.data.name,
          runtimeMeterValue: parsed.data.runtime_meter_value,
          runtimeMeterUnit: normalizedRuntimeMeterUnit,
          imageUrl: shouldStoreImageInLocalBucket ? null : imageUrl,
          attributesJson
        });

        if (shouldStoreImageInLocalBucket) {
          // NOTE(local-bucket): temporary local adapter; production will migrate to cloud bucket.
          const stored = await storeDataImageUrlInLocalBucket({
            organizationId,
            scope: 'assets',
            entityId: String(created.id),
            dataUrl: imageUrl
          });
          if (!stored?.publicUrl) return { invalidImage: true };

          await trx('assets')
            .where({ id: created.id, organization_id: organizationId })
            .update({ image_url: stored.publicUrl, updated_at: trx.fn.now() });
          created.image_url = stored.publicUrl;
        }

        await upsertRefNode(trx, {
          organizationId,
          nodeType: 'ASSET',
          refTable: 'assets',
          refId: created.id,
          name: created.name,
          code: created.code ?? null,
          isStocked: true,
          metaJson: buildAssetNodeMeta(created)
        });

        await insertAssetEvent(trx, {
          organizationId,
          assetId: created.id,
          eventType: 'MOVE',
          occurredAt: trx.fn.now(),
          fromLocationId: null,
          toLocationId: created.location_id,
          note: 'Created'
        });

        return created;
      });

      if (asset?.invalidImage) return { invalidImage: true };
      return { asset };
    })
    .then((result) => {
      if (result.invalidImage) return res.status(400).json({ message: 'Invalid image_url. Use /api/public/files URL, http(s) URL, or data:image payload.' });
      if (result.notFoundLocation) return res.status(404).json({ message: 'Location not found' });
      if (result.notFoundParent) return res.status(404).json({ message: 'Parent asset not found' });
      if (result.parentRuntimeUnitMismatch) {
        return res.status(409).json({
          message: 'Parent and child assets must use the same runtime meter unit',
          runtime_meter_unit: result.runtimeMeterUnit,
          parent_runtime_meter_unit: result.parentRuntimeMeterUnit
        });
      }
      if (result.notFoundType) return res.status(404).json({ message: 'Asset card not found' });
      if (result.invalidAttributes) return res.status(400).json({ message: result.invalidAttributes });
      return res.status(201).json({ asset: result.asset });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create asset' }));
});

const updateSchema = z.object({
  parent_asset_id: z.number().int().positive().optional().nullable(),
  asset_card_id: z.number().int().positive().optional().nullable(),
  asset_type_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(1).max(64).optional().nullable(),
  name: z.string().min(1).max(255),
  runtime_meter_value: z.number().nonnegative().optional(),
  runtime_meter_unit: z.enum(['HOUR', 'KM']).optional(),
  image_url: z.string().max(4_000_000).optional().nullable(),
  attributes_json: z.unknown().optional().nullable()
});

router.put('/organizations/:id/assets/:assetId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      let attributesJson = parsed.data.attributes_json ?? null;
      let runtimeMeterUnit = parsed.data.runtime_meter_unit;

      const existing = await db('assets')
        .where({ id: assetId, organization_id: organizationId })
        .first(['id', 'location_id', 'image_url', 'parent_asset_id', 'runtime_meter_unit']);
      if (!existing) return { notFound: true };

      const imageUrlInput = normalizeAssetImageUrl(parsed.data.image_url);
      if (imageUrlInput === undefined) return { invalidImage: true };
      const shouldStoreImageInLocalBucket = typeof imageUrlInput === 'string' && imageUrlInput.toLowerCase().startsWith('data:image/');
      if (shouldStoreImageInLocalBucket && !decodeBase64ImageDataUrl(imageUrlInput)) return { invalidImage: true };

      let imageUrl = parsed.data.image_url === undefined ? (existing.image_url ?? null) : imageUrlInput;
      if (shouldStoreImageInLocalBucket) {
        const stored = await storeDataImageUrlInLocalBucket({
          organizationId,
          scope: 'assets',
          entityId: String(assetId),
          dataUrl: imageUrlInput
        });
        if (!stored?.publicUrl) return { invalidImage: true };
        imageUrl = stored.publicUrl;
      }

      const resolvedAssetCardId = parsed.data.asset_card_id ?? parsed.data.asset_type_id ?? null;
      if (resolvedAssetCardId) {
        const resolvedType = await resolveAssetCardSchemaRows(organizationId, resolvedAssetCardId);
        if (resolvedType.notFound) return { notFoundType: true };

        const schemaRows = resolvedType.schemaRows;
        const normalizedAttr = normalizeAttributesBySchema(parsed.data.attributes_json ?? null, schemaRows);
        if (!normalizedAttr.ok) return { invalidAttributes: normalizedAttr.message };
        attributesJson = normalizedAttr.value;
        runtimeMeterUnit = resolvedType.runtimeMeterUnit;
      }

      const currentParentAssetId = existing.parent_asset_id ?? null;
      const nextParentAssetId = parsed.data.parent_asset_id ?? null;
      const currentRuntimeMeterUnit = normalizeRuntimeMeterUnit(existing.runtime_meter_unit);
      const nextRuntimeMeterUnit =
        runtimeMeterUnit === 'HOUR' || runtimeMeterUnit === 'KM' ? runtimeMeterUnit : currentRuntimeMeterUnit;
      const parentChanged = nextParentAssetId !== currentParentAssetId;
      const runtimeUnitChanged = nextRuntimeMeterUnit !== currentRuntimeMeterUnit;

      if (nextParentAssetId) {
        if (nextParentAssetId === assetId) return { selfParent: true };
        if (parentChanged || runtimeUnitChanged) {
          const parent = await db('assets')
            .where({ id: nextParentAssetId, organization_id: organizationId })
            .first(['id', 'runtime_meter_unit']);
          if (!parent) return { notFoundParent: true };

          const parentRuntimeMeterUnit = normalizeRuntimeMeterUnit(parent.runtime_meter_unit);
          if (parentRuntimeMeterUnit !== nextRuntimeMeterUnit) {
            return {
              parentRuntimeUnitMismatch: true,
              runtimeMeterUnit: nextRuntimeMeterUnit,
              parentRuntimeMeterUnit
            };
          }
        }
      }

      if (runtimeUnitChanged) {
        const child = await db('assets')
          .where({ organization_id: organizationId, parent_asset_id: assetId })
          .andWhereRaw(`(case when runtime_meter_unit = 'KM' then 'KM' else 'HOUR' end) <> ?`, [nextRuntimeMeterUnit])
          .first(['id', 'runtime_meter_unit']);

        if (child) {
          return {
            childRuntimeUnitMismatch: true,
            runtimeMeterUnit: nextRuntimeMeterUnit,
            childRuntimeMeterUnit: normalizeRuntimeMeterUnit(child.runtime_meter_unit),
            childAssetId: child.id
          };
        }
      }

      const runtimeMeterUnitForUpdate = runtimeUnitChanged ? nextRuntimeMeterUnit : undefined;

      const asset = await db.transaction(async (trx) => {
        const updated = await updateAsset(trx, {
          organizationId,
          assetId,
          parentAssetId: nextParentAssetId,
          assetCardId: resolvedAssetCardId,
          code: parsed.data.code ?? null,
          name: parsed.data.name,
          runtimeMeterValue: parsed.data.runtime_meter_value,
          runtimeMeterUnit: runtimeMeterUnitForUpdate,
          imageUrl,
          attributesJson
        });
        if (!updated) return null;

        await upsertRefNode(trx, {
          organizationId,
          nodeType: 'ASSET',
          refTable: 'assets',
          refId: updated.id,
          name: updated.name,
          code: updated.code ?? null,
          isStocked: true,
          metaJson: buildAssetNodeMeta(updated)
        });

        return updated;
      });

      return {
        asset,
        previousImageUrl: existing.image_url ?? null,
        nextImageUrl: imageUrl ?? null
      };
    })
    .then(async (result) => {
      if (result.invalidImage) return res.status(400).json({ message: 'Invalid image_url. Use /api/public/files URL, http(s) URL, or data:image payload.' });
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.selfParent) return res.status(400).json({ message: 'Asset cannot be its own parent' });
      if (result.notFoundParent) return res.status(404).json({ message: 'Parent asset not found' });
      if (result.parentRuntimeUnitMismatch) {
        return res.status(409).json({
          message: 'Parent and child assets must use the same runtime meter unit',
          runtime_meter_unit: result.runtimeMeterUnit,
          parent_runtime_meter_unit: result.parentRuntimeMeterUnit
        });
      }
      if (result.childRuntimeUnitMismatch) {
        return res.status(409).json({
          message: 'Asset runtime meter unit must match all child assets',
          runtime_meter_unit: result.runtimeMeterUnit,
          child_runtime_meter_unit: result.childRuntimeMeterUnit,
          child_asset_id: result.childAssetId
        });
      }
      if (result.notFoundType) return res.status(404).json({ message: 'Asset card not found' });
      if (result.invalidAttributes) return res.status(400).json({ message: result.invalidAttributes });
      if (!result.asset) return res.status(404).json({ message: 'Asset not found' });

      const shouldDeletePreviousImage =
        result.previousImageUrl &&
        result.previousImageUrl !== result.nextImageUrl &&
        isLocalBucketPublicUrl(result.previousImageUrl);
      if (shouldDeletePreviousImage) {
        await deleteLocalBucketObjectByPublicUrl(result.previousImageUrl).catch(() => {});
      }

      return res.status(200).json({ asset: result.asset });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update asset' }));
});

router.delete('/organizations/:id/assets/:assetId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id', 'image_url']);
      if (!existing) return { notFound: true };

      const child = await db('assets').where({ organization_id: organizationId, parent_asset_id: assetId }).first(['id']);
      if (child) return { conflictChildren: true };

      const node = await findNodeByRef(organizationId, 'ASSET', 'assets', assetId);
      if (node) {
        const used = await db('inventory_movement_lines')
          .where({ organization_id: organizationId })
          .andWhere((b) => b.where({ from_node_id: node.id }).orWhere({ to_node_id: node.id }))
          .first(['id']);
        if (used) return { conflictMovements: true };
      }

      await db.transaction(async (trx) => {
        const removed = await deleteAsset(trx, { organizationId, assetId });
        if (removed) {
          await deleteRefNode(trx, { organizationId, nodeType: 'ASSET', refTable: 'assets', refId: assetId });
        }
      });

      return { ok: true, previousImageUrl: existing.image_url ?? null };
    })
    .then(async (result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.conflictChildren) return res.status(409).json({ message: 'Asset has child assets' });
      if (result.conflictMovements) return res.status(409).json({ message: 'Asset has inventory movement history' });

      if (result.previousImageUrl && isLocalBucketPublicUrl(result.previousImageUrl)) {
        await deleteLocalBucketObjectByPublicUrl(result.previousImageUrl).catch(() => {});
      }

      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete asset' }));
});

const moveSchema = z.object({
  to_location_id: z.number().int().positive(),
  occurred_at: z.string().datetime().optional(),
  note: z.string().max(8000).optional().nullable()
});

router.post('/organizations/:id/assets/:assetId/move', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const location = await db('locations').where({ id: parsed.data.to_location_id, organization_id: organizationId }).first(['id']);
      if (!location) return { notFoundLocation: true };

      const asset = await db.transaction(async (trx) => {
        const locked = await lockAssetForUpdate(trx, { organizationId, assetId });
        if (!locked) return null;

        const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : new Date();

        const updated = await updateAssetLocation(trx, { organizationId, assetId, toLocationId: parsed.data.to_location_id });
        if (!updated) return null;

        await insertAssetEvent(trx, {
          organizationId,
          assetId,
          eventType: 'MOVE',
          occurredAt,
          fromLocationId: locked.location_id ?? null,
          toLocationId: parsed.data.to_location_id,
          note: parsed.data.note ?? null
        });

        await upsertRefNode(trx, {
          organizationId,
          nodeType: 'ASSET',
          refTable: 'assets',
          refId: updated.id,
          name: updated.name,
          code: updated.code ?? null,
          isStocked: true,
          metaJson: buildAssetNodeMeta(updated)
        });

        return updated;
      });

      return { asset };
    })
    .then((result) => {
      if (result.notFoundLocation) return res.status(404).json({ message: 'Location not found' });
      if (!result.asset) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ asset: result.asset });
    })
    .catch(() => res.status(500).json({ message: 'Failed to move asset' }));
});

const stateSchema = z.object({
  to_state: z.enum(['STOPPED', 'RUNNING', 'MAINTENANCE', 'DOWN']),
  occurred_at: z.string().datetime().optional(),
  note: z.string().max(8000).optional().nullable()
});

router.post('/organizations/:id/assets/:assetId/state', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const parsed = stateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const asset = await db.transaction(async (trx) => {
        const locked = await lockAssetForUpdate(trx, { organizationId, assetId });
        if (!locked) return null;

        const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : new Date();

        if (locked.current_state === parsed.data.to_state) return locked;

        const updated = await updateAssetState(trx, {
          organizationId,
          assetId,
          toState: parsed.data.to_state
        });
        if (!updated) return null;

        await insertAssetEvent(trx, {
          organizationId,
          assetId,
          eventType: 'STATE',
          occurredAt,
          fromState: locked.current_state ?? null,
          toState: parsed.data.to_state,
          note: parsed.data.note ?? null
        });

        await upsertRefNode(trx, {
          organizationId,
          nodeType: 'ASSET',
          refTable: 'assets',
          refId: updated.id,
          name: updated.name,
          code: updated.code ?? null,
          isStocked: true,
          metaJson: buildAssetNodeMeta(updated)
        });

        return updated;
      });

      return { asset };
    })
    .then((result) => {
      if (!result.asset) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ asset: result.asset });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update asset state' }));
});

router.get('/organizations/:id/assets/:assetId/events', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;

  return Promise.resolve()
    .then(async () => {
      const existing = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFound: true };

      const events = await listAssetEvents(organizationId, assetId, { limit });
      return { events };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ events: result.events });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch asset events' }));
});

router.get('/organizations/:id/assets/:assetId/bom', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFound: true };

      const lines = await listAssetBomLines(organizationId, assetId);
      return { lines };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ lines: result.lines });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch asset BOM' }));
});

const bomCreateSchema = z.object({
  inventory_item_card_id: z.number().int().positive(),
  quantity: z.number().positive(),
  note: z.string().max(8000).optional().nullable(),
  meta_json: z.unknown().optional().nullable()
});

router.post('/organizations/:id/assets/:assetId/bom', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const parsed = bomCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const asset = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!asset) return { notFound: true };

      const inventoryItemCard = await db('inventory_item_cards as iic')
        .where({ 'iic.id': parsed.data.inventory_item_card_id, 'iic.organization_id': organizationId })
        .first(['iic.id', 'iic.amount_unit_id']);
      if (!inventoryItemCard) return { notFoundItem: true };
      const sparePartItem = await db('inventory_items as ii')
        .leftJoin({ wt: 'warehouse_types' }, function joinWarehouseType() {
          this.on('wt.id', '=', 'ii.warehouse_type_id').andOn('wt.organization_id', '=', 'ii.organization_id');
        })
        .where({
          'ii.organization_id': organizationId,
          'ii.inventory_item_card_id': inventoryItemCard.id
        })
        .whereRaw('upper(wt.code) = ?', ['SPARE_PART'])
        .first(['ii.id']);
      if (!sparePartItem) return { invalidItemType: true };

      const conflict = await db('asset_bom_lines')
        .where({ organization_id: organizationId, asset_id: assetId, inventory_item_card_id: parsed.data.inventory_item_card_id })
        .first(['id']);
      if (conflict) return { conflict: true };

      const line = await db.transaction((trx) =>
        createAssetBomLine(trx, {
          organizationId,
          assetId,
          inventoryItemCardId: parsed.data.inventory_item_card_id,
          unitId: inventoryItemCard.amount_unit_id,
          quantity: parsed.data.quantity,
          note: parsed.data.note ?? null,
          metaJson: parsed.data.meta_json ?? null
        })
      );

      return { line };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.notFoundItem) return res.status(404).json({ message: 'Inventory item card not found' });
      if (result.invalidItemType) return res.status(400).json({ message: 'Only equipment inventory item cards can be added to BOM' });
      if (result.conflict) return res.status(409).json({ message: 'Item already exists in BOM' });
      return res.status(201).json({ line: result.line });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create BOM line' }));
});

const bomUpdateSchema = z.object({
  quantity: z.number().positive(),
  note: z.string().max(8000).optional().nullable(),
  meta_json: z.unknown().optional().nullable()
});

router.put('/organizations/:id/assets/:assetId/bom/:lineId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  const lineId = Number(req.params.lineId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });
  if (!Number.isFinite(lineId)) return res.status(400).json({ message: 'Invalid BOM line id' });

  const parsed = bomUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const asset = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!asset) return { notFound: true };

      const line = await db.transaction((trx) =>
        updateAssetBomLine(trx, {
          organizationId,
          assetId,
          lineId,
          quantity: parsed.data.quantity,
          note: parsed.data.note ?? null,
          metaJson: parsed.data.meta_json ?? null
        })
      );
      return { line };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (!result.line) return res.status(404).json({ message: 'BOM line not found' });
      return res.status(200).json({ line: result.line });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update BOM line' }));
});

router.delete('/organizations/:id/assets/:assetId/bom/:lineId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  const lineId = Number(req.params.lineId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });
  if (!Number.isFinite(lineId)) return res.status(400).json({ message: 'Invalid BOM line id' });

  return Promise.resolve()
    .then(async () => {
      const asset = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!asset) return { notFound: true };

      const deleted = await db.transaction((trx) => deleteAssetBomLine(trx, { organizationId, assetId, lineId }));
      if (!deleted) return { notFoundLine: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.notFoundLine) return res.status(404).json({ message: 'BOM line not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete BOM line' }));
});

router.get('/organizations/:id/assets/:assetId/bom/rollup', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  return Promise.resolve()
    .then(async () => {
      const asset = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!asset) return { notFound: true };

      const result = await getAssetBomRollup(organizationId, assetId);
      return { rollup: result.rows ?? [] };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ rollup: result.rollup });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch BOM rollup' }));
});

export default router;
