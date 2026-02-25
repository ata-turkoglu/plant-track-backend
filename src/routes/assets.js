import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import { listAssetTypeFieldsByAssetType } from '../models/assetTypes.js';
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
    active: asset.active,
    location_id: asset.location_id ?? null,
    parent_asset_id: asset.parent_asset_id ?? null,
    asset_type_id: asset.asset_type_id ?? null,
    current_state: asset.current_state,
    running_since: asset.running_since ?? null,
    runtime_seconds: asset.runtime_seconds ?? 0
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

function mapAssetTypeFieldsToSchemaRows(rows) {
  return rows
    .filter((row) => row.active !== false)
    .map((row) => ({
      key: (row.name ?? '').trim(),
      label: (row.label ?? '').trim() || (row.name ?? '').trim(),
      type: normalizeFieldType(row.input_type),
      required: Boolean(row.required),
      unitId: normalizeUnitId(row.unit_id)
    }))
    .filter((row) => Boolean(row.key));
}

async function resolveAssetTypeSchemaRows(organizationId, assetTypeId) {
  const type = await db('asset_types').where({ id: assetTypeId, organization_id: organizationId }).first(['id']);
  if (!type) return { notFound: true };

  const fieldRows = await listAssetTypeFieldsByAssetType(organizationId, assetTypeId, { active: true });
  return { notFound: false, schemaRows: mapAssetTypeFieldsToSchemaRows(fieldRows) };
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
  const assetTypeId = typeof req.query.assetTypeId === 'string' ? req.query.assetTypeId : undefined;
  const activeRaw = typeof req.query.active === 'string' ? req.query.active : undefined;

  const parentAssetId = parentAssetIdRaw === undefined ? undefined : parentAssetIdRaw === 'null' ? null : Number(parentAssetIdRaw);
  const active = activeRaw === undefined ? undefined : activeRaw.toLowerCase() === 'true';

  return Promise.resolve()
    .then(() => listAssetsByOrganization(organizationId, { locationId, parentAssetId, assetTypeId, active }))
    .then((assets) => res.status(200).json({ assets }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch assets' }));
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
  asset_type_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(1).max(64).optional().nullable(),
  name: z.string().min(1).max(255),
  active: z.boolean().optional(),
  attributes_json: z.unknown().optional().nullable()
});

router.post('/organizations/:id/assets', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      let attributesJson = parsed.data.attributes_json ?? null;

      const location = await db('locations').where({ id: parsed.data.location_id, organization_id: organizationId }).first(['id']);
      if (!location) return { notFoundLocation: true };

      if (parsed.data.parent_asset_id) {
        const parent = await db('assets').where({ id: parsed.data.parent_asset_id, organization_id: organizationId }).first(['id']);
        if (!parent) return { notFoundParent: true };
      }

      if (parsed.data.asset_type_id) {
        const resolvedType = await resolveAssetTypeSchemaRows(organizationId, parsed.data.asset_type_id);
        if (resolvedType.notFound) return { notFoundType: true };

        const schemaRows = resolvedType.schemaRows;
        const normalizedAttr = normalizeAttributesBySchema(parsed.data.attributes_json ?? null, schemaRows);
        if (!normalizedAttr.ok) return { invalidAttributes: normalizedAttr.message };
        attributesJson = normalizedAttr.value;
      }

      const asset = await db.transaction(async (trx) => {
        const created = await createAsset(trx, {
          organizationId,
          locationId: parsed.data.location_id,
          parentAssetId: parsed.data.parent_asset_id ?? null,
          assetTypeId: parsed.data.asset_type_id ?? null,
          code: parsed.data.code ?? null,
          name: parsed.data.name,
          active: parsed.data.active,
          attributesJson
        });

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

      return { asset };
    })
    .then((result) => {
      if (result.notFoundLocation) return res.status(404).json({ message: 'Location not found' });
      if (result.notFoundParent) return res.status(404).json({ message: 'Parent asset not found' });
      if (result.notFoundType) return res.status(404).json({ message: 'Asset type not found' });
      if (result.invalidAttributes) return res.status(400).json({ message: result.invalidAttributes });
      return res.status(201).json({ asset: result.asset });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create asset' }));
});

const updateSchema = z.object({
  parent_asset_id: z.number().int().positive().optional().nullable(),
  asset_type_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(1).max(64).optional().nullable(),
  name: z.string().min(1).max(255),
  active: z.boolean().optional(),
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

      const existing = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id', 'location_id']);
      if (!existing) return { notFound: true };

      if (parsed.data.parent_asset_id) {
        if (parsed.data.parent_asset_id === assetId) return { selfParent: true };
        const parent = await db('assets').where({ id: parsed.data.parent_asset_id, organization_id: organizationId }).first(['id']);
        if (!parent) return { notFoundParent: true };
      }

      if (parsed.data.asset_type_id) {
        const resolvedType = await resolveAssetTypeSchemaRows(organizationId, parsed.data.asset_type_id);
        if (resolvedType.notFound) return { notFoundType: true };

        const schemaRows = resolvedType.schemaRows;
        const normalizedAttr = normalizeAttributesBySchema(parsed.data.attributes_json ?? null, schemaRows);
        if (!normalizedAttr.ok) return { invalidAttributes: normalizedAttr.message };
        attributesJson = normalizedAttr.value;
      }

      const asset = await db.transaction(async (trx) => {
        const updated = await updateAsset(trx, {
          organizationId,
          assetId,
          parentAssetId: parsed.data.parent_asset_id ?? null,
          assetTypeId: parsed.data.asset_type_id ?? null,
          code: parsed.data.code ?? null,
          name: parsed.data.name,
          active: parsed.data.active,
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

      return { asset };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.selfParent) return res.status(400).json({ message: 'Asset cannot be its own parent' });
      if (result.notFoundParent) return res.status(404).json({ message: 'Parent asset not found' });
      if (result.notFoundType) return res.status(404).json({ message: 'Asset type not found' });
      if (result.invalidAttributes) return res.status(400).json({ message: result.invalidAttributes });
      if (!result.asset) return res.status(404).json({ message: 'Asset not found' });
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
      const existing = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
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

      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.conflictChildren) return res.status(409).json({ message: 'Asset has child assets' });
      if (result.conflictMovements) return res.status(409).json({ message: 'Asset has inventory movement history' });
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

        if (locked.current_state === 'RUNNING' && locked.running_since) {
          if (occurredAt.getTime() < new Date(locked.running_since).getTime()) {
            return { invalidTime: true };
          }
        }

        const updated = await updateAssetState(trx, {
          organizationId,
          assetId,
          currentState: locked.current_state,
          runningSince: locked.running_since,
          runtimeSeconds: locked.runtime_seconds,
          toState: parsed.data.to_state,
          occurredAt
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

      if (asset && asset.invalidTime) return { invalidTime: true };
      return { asset };
    })
    .then((result) => {
      if (result.invalidTime) return res.status(400).json({ message: 'Invalid occurred_at for current running state' });
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
  item_id: z.number().int().positive(),
  quantity: z.number().positive(),
  preferred: z.boolean().optional(),
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

      const item = await db('items')
        .where({ id: parsed.data.item_id, organization_id: organizationId })
        .first(['id', 'unit_id']);
      if (!item) return { notFoundItem: true };

      const conflict = await db('asset_bom_lines')
        .where({ organization_id: organizationId, asset_id: assetId, item_id: parsed.data.item_id })
        .first(['id']);
      if (conflict) return { conflict: true };

      const line = await db.transaction((trx) =>
        createAssetBomLine(trx, {
          organizationId,
          assetId,
          itemId: parsed.data.item_id,
          unitId: item.unit_id,
          quantity: parsed.data.quantity,
          preferred: parsed.data.preferred,
          note: parsed.data.note ?? null,
          metaJson: parsed.data.meta_json ?? null
        })
      );

      return { line };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.notFoundItem) return res.status(404).json({ message: 'Item not found' });
      if (result.conflict) return res.status(409).json({ message: 'Item already exists in BOM' });
      return res.status(201).json({ line: result.line });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create BOM line' }));
});

const bomUpdateSchema = z.object({
  quantity: z.number().positive(),
  preferred: z.boolean().optional(),
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
          preferred: parsed.data.preferred,
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
