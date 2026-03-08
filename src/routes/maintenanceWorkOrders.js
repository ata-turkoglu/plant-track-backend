import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import {
  completeMaintenanceWorkOrder,
  createMaintenanceWorkOrder,
  getMaintenanceWorkOrderById,
  insertMaintenanceWorkOrderParts,
  listMaintenanceWorkOrdersByOrganization,
  listMaintenanceWorkOrderParts,
  listMaintenanceWorkOrdersByAsset,
  startMaintenanceWorkOrder,
  updateMaintenanceWorkOrder
} from '../models/maintenanceWorkOrders.js';
import { createMovementEvent } from '../models/inventoryMovements.js';
import { insertAssetEvent, lockAssetForUpdate, updateAssetState } from '../models/assets.js';
import {
  buildLocalBucketPublicUrl,
  decodeBase64ImageDataUrl,
  deleteLocalBucketObjectByPublicUrl,
  parseLocalBucketObjectKeyFromPublicUrl,
  storeDataImageUrlInLocalBucket
} from '../services/localBucket.js';
import { parsePaginationQuery } from '../utils/pagination.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/maintenance-work-orders', (req, res) => {
  const organizationId = req.organizationId;
  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 12, maxPageSize: 100 });
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined;
  const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : undefined;
  const assignedFirmId = typeof req.query.assignedFirmId === 'string' ? req.query.assignedFirmId : undefined;
  const assignedEmployeeId = typeof req.query.assignedEmployeeId === 'string' ? req.query.assignedEmployeeId : undefined;
  const title = typeof req.query.title === 'string' ? req.query.title : undefined;
  const assetName = typeof req.query.assetName === 'string' ? req.query.assetName : undefined;

  return Promise.resolve()
    .then(() =>
      listMaintenanceWorkOrdersByOrganization(organizationId, {
        q,
        status,
        type,
        priority,
        assetId,
        locationId,
        assignedFirmId,
        assignedEmployeeId,
        title,
        assetName,
        page: pagination.page,
        pageSize: pagination.pageSize
      })
    )
    .then((result) => res.status(200).json({ workOrders: result.rows, pagination: result.pagination }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch maintenance work orders' }));
});

function buildAssetNodeMeta(asset) {
  return {
    location_id: asset.location_id ?? null,
    parent_asset_id: asset.parent_asset_id ?? null,
    asset_card_id: asset.asset_card_id ?? null,
    current_state: asset.current_state,
    running_since: asset.running_since ?? null,
    runtime_seconds: asset.runtime_seconds ?? 0
  };
}

async function syncAssetNode(trx, organizationId, asset) {
  await trx('nodes')
    .insert({
      organization_id: organizationId,
      node_type: 'ASSET',
      ref_table: 'assets',
      ref_id: String(asset.id),
      code: asset.code ?? null,
      name: asset.name,
      is_stocked: true,
      meta_json: buildAssetNodeMeta(asset)
    })
    .onConflict(['organization_id', 'node_type', 'ref_table', 'ref_id'])
    .merge({
      code: asset.code ?? null,
      name: asset.name,
      is_stocked: true,
      meta_json: buildAssetNodeMeta(asset),
      updated_at: trx.fn.now()
    });
}

async function transitionAssetState(trx, { organizationId, assetId, toState, occurredAt, note }) {
  if (!toState) return { ok: true, asset: null };

  const locked = await lockAssetForUpdate(trx, { organizationId, assetId });
  if (!locked) return { notFoundAsset: true };

  if (locked.current_state === toState) return { ok: true, asset: locked };

  if (locked.current_state === 'RUNNING' && locked.running_since) {
    const runningSince = new Date(locked.running_since).getTime();
    if (Number.isFinite(runningSince) && occurredAt.getTime() < runningSince) {
      return { invalidTime: true };
    }
  }

  const updated = await updateAssetState(trx, {
    organizationId,
    assetId,
    currentState: locked.current_state,
    runningSince: locked.running_since,
    runtimeSeconds: locked.runtime_seconds,
    toState,
    occurredAt
  });
  if (!updated) return { notFoundAsset: true };

  await insertAssetEvent(trx, {
    organizationId,
    assetId,
    eventType: 'STATE',
    occurredAt,
    fromState: locked.current_state ?? null,
    toState,
    note: note ?? null
  });
  await syncAssetNode(trx, organizationId, updated);

  return { ok: true, asset: updated };
}

const MAINTENANCE_IMAGE_MAX_COUNT = 8;
const MAINTENANCE_IMAGE_MAX_BYTES = 4_000_000;
const maintenanceImagesSchema = z.array(z.string().max(MAINTENANCE_IMAGE_MAX_BYTES)).max(MAINTENANCE_IMAGE_MAX_COUNT);

function normalizeMaintenanceImageUrl(value) {
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

function normalizeMaintenanceImageList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => Boolean(item));
}

async function resolveMaintenanceImageUrls({ organizationId, imageUrls, scope, entityId }) {
  const normalizedUrls = normalizeMaintenanceImageList(imageUrls);
  const dedupe = new Set();
  const resolvedUrls = [];

  for (const rawUrl of normalizedUrls) {
    const normalizedUrl = normalizeMaintenanceImageUrl(rawUrl);
    if (normalizedUrl === undefined) return { invalidImage: true };
    if (!normalizedUrl) continue;

    let finalUrl = normalizedUrl;
    if (normalizedUrl.toLowerCase().startsWith('data:image/')) {
      if (!decodeBase64ImageDataUrl(normalizedUrl)) return { invalidImage: true };

      // NOTE(local-bucket): temporary local adapter; production will migrate to cloud bucket.
      const stored = await storeDataImageUrlInLocalBucket({
        organizationId,
        scope,
        entityId,
        dataUrl: normalizedUrl
      });
      if (!stored?.publicUrl) return { invalidImage: true };
      finalUrl = stored.publicUrl;
    }

    if (!dedupe.has(finalUrl)) {
      dedupe.add(finalUrl);
      resolvedUrls.push(finalUrl);
    }
  }

  return { imageUrls: resolvedUrls };
}

function findRemovedLocalBucketUrls(previousUrls, nextUrls) {
  const nextSet = new Set(normalizeMaintenanceImageList(nextUrls));
  return normalizeMaintenanceImageList(previousUrls).filter((url) => !nextSet.has(url) && parseLocalBucketObjectKeyFromPublicUrl(url));
}

const workOrderUpsertSchema = z.object({
  type: z.enum(['CORRECTIVE', 'PREVENTIVE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  title: z.string().trim().min(1).max(255),
  symptom: z.string().max(8000).optional().nullable(),
  note: z.string().max(8000).optional().nullable(),
  open_images: maintenanceImagesSchema.optional(),
  planned_at: z.string().datetime().optional().nullable(),
  assigned_firm_id: z.number().int().positive().optional().nullable(),
  assigned_employee_ids: z.array(z.number().int().positive()).optional(),
  requested_state: z.enum(['MAINTENANCE', 'DOWN']).optional().nullable()
});

function normalizeAssignedEmployeeIds(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  for (const value of values) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) continue;
    unique.add(Math.trunc(numeric));
  }
  return Array.from(unique);
}

async function validateAssignedEmployees(organizationId, assignedEmployeeIds) {
  if (!assignedEmployeeIds.length) return true;
  const employees = await db('employees')
    .where({ organization_id: organizationId })
    .whereIn('id', assignedEmployeeIds)
    .select(['id']);
  return employees.length === assignedEmployeeIds.length;
}

router.get('/organizations/:id/assets/:assetId/maintenance-work-orders', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 5, maxPageSize: 50 });
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;

  return Promise.resolve()
    .then(async () => {
      const asset = await db('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
      if (!asset) return { notFound: true };

      const result = await listMaintenanceWorkOrdersByAsset(organizationId, assetId, {
        status,
        page: pagination.page,
        pageSize: pagination.pageSize
      });
      return result;
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      return res.status(200).json({ workOrders: result.rows, pagination: result.pagination });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch maintenance work orders' }));
});

router.get('/organizations/:id/assets/:assetId/maintenance-work-orders/:workOrderId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  const workOrderId = Number(req.params.workOrderId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });
  if (!Number.isFinite(workOrderId)) return res.status(400).json({ message: 'Invalid work order id' });

  return Promise.resolve()
    .then(async () => {
      const workOrder = await getMaintenanceWorkOrderById(organizationId, workOrderId);
      if (!workOrder || workOrder.asset_id !== assetId) return { notFound: true };

      const parts = await listMaintenanceWorkOrderParts(organizationId, workOrderId);
      return { workOrder, parts };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Maintenance work order not found' });
      return res.status(200).json({ workOrder: result.workOrder, parts: result.parts });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch maintenance work order' }));
});

router.post('/organizations/:id/assets/:assetId/maintenance-work-orders', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });

  const parsed = workOrderUpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      if (parsed.data.assigned_firm_id) {
        const firm = await db('firms').where({ id: parsed.data.assigned_firm_id, organization_id: organizationId }).first(['id']);
        if (!firm) return { badFirm: true };
      }
      const assignedEmployeeIds = normalizeAssignedEmployeeIds(parsed.data.assigned_employee_ids);
      if (!(await validateAssignedEmployees(organizationId, assignedEmployeeIds))) return { badEmployee: true };
      const openImagesResult = await resolveMaintenanceImageUrls({
        organizationId,
        imageUrls: parsed.data.open_images ?? [],
        scope: 'maintenance-work-orders/open',
        entityId: `asset-${assetId}`
      });
      if (openImagesResult.invalidImage) return { invalidImage: true };

      const created = await db.transaction(async (trx) => {
        const asset = await trx('assets').where({ id: assetId, organization_id: organizationId }).first(['id']);
        if (!asset) return { notFound: true };

        const workOrder = await createMaintenanceWorkOrder(trx, {
          organizationId,
          assetId,
          type: parsed.data.type,
          priority: parsed.data.priority,
          title: parsed.data.title.trim(),
          symptom: parsed.data.symptom?.trim() || null,
          note: parsed.data.note?.trim() || null,
          openImagesJson: openImagesResult.imageUrls,
          plannedAt: parsed.data.planned_at ? new Date(parsed.data.planned_at) : null,
          assignedFirmId: parsed.data.assigned_firm_id ?? null,
          assignedEmployeeIds,
          createdByUserId: null
        });

        if (parsed.data.requested_state) {
          const stateResult = await transitionAssetState(trx, {
            organizationId,
            assetId,
            toState: parsed.data.requested_state,
            occurredAt: new Date(),
            note: `Maintenance work order #${workOrder.id} opened`
          });
          if (stateResult.invalidTime) return { invalidTime: true };
        }

        return workOrder;
      });

      if (created?.notFound) return { notFound: true };
      if (created?.invalidTime) return { invalidTime: true };

      const workOrder = await getMaintenanceWorkOrderById(organizationId, created.id);
      return { workOrder };
    })
    .then((result) => {
      if (result.invalidImage) return res.status(400).json({ message: 'Invalid open_images. Use /api/public/files URL, http(s) URL, or data:image payload.' });
      if (result.badFirm) return res.status(404).json({ message: 'Assigned firm not found' });
      if (result.badEmployee) return res.status(404).json({ message: 'Assigned employee not found' });
      if (result.notFound) return res.status(404).json({ message: 'Asset not found' });
      if (result.invalidTime) return res.status(400).json({ message: 'Invalid asset state transition time' });
      return res.status(201).json({ workOrder: result.workOrder });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create maintenance work order' }));
});

router.put('/organizations/:id/assets/:assetId/maintenance-work-orders/:workOrderId', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  const workOrderId = Number(req.params.workOrderId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });
  if (!Number.isFinite(workOrderId)) return res.status(400).json({ message: 'Invalid work order id' });

  const parsed = workOrderUpsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      if (parsed.data.assigned_firm_id) {
        const firm = await db('firms').where({ id: parsed.data.assigned_firm_id, organization_id: organizationId }).first(['id']);
        if (!firm) return { badFirm: true };
      }
      const assignedEmployeeIds = normalizeAssignedEmployeeIds(parsed.data.assigned_employee_ids);
      if (!(await validateAssignedEmployees(organizationId, assignedEmployeeIds))) return { badEmployee: true };
      const openImagesResult =
        parsed.data.open_images !== undefined
          ? await resolveMaintenanceImageUrls({
              organizationId,
              imageUrls: parsed.data.open_images,
              scope: 'maintenance-work-orders/open',
              entityId: String(workOrderId)
            })
          : null;
      if (openImagesResult?.invalidImage) return { invalidImage: true };

      const updated = await db.transaction(async (trx) => {
        const existing = await trx('maintenance_work_orders')
          .where({ id: workOrderId, organization_id: organizationId, asset_id: assetId })
          .forUpdate()
          .first(['id', 'status', 'open_images_json']);
        if (!existing) return { notFound: true };
        if (existing.status === 'DONE' || existing.status === 'CANCELLED') return { invalidStatus: true };

        const workOrder = await updateMaintenanceWorkOrder(trx, {
          organizationId,
          workOrderId,
          type: parsed.data.type,
          priority: parsed.data.priority,
          title: parsed.data.title.trim(),
          symptom: parsed.data.symptom?.trim() || null,
          note: parsed.data.note?.trim() || null,
          openImagesJson: openImagesResult?.imageUrls,
          plannedAt: parsed.data.planned_at ? new Date(parsed.data.planned_at) : null,
          assignedFirmId: parsed.data.assigned_firm_id ?? null,
          assignedEmployeeIds
        });

        if (parsed.data.requested_state) {
          const stateResult = await transitionAssetState(trx, {
            organizationId,
            assetId,
            toState: parsed.data.requested_state,
            occurredAt: new Date(),
            note: `Maintenance work order #${workOrderId} updated`
          });
          if (stateResult.invalidTime) return { invalidTime: true };
        }

        return {
          workOrder,
          previousOpenImages: normalizeMaintenanceImageList(existing.open_images_json)
        };
      });

      if (updated?.notFound || updated?.invalidStatus || updated?.invalidTime) return updated;
      if (!updated?.workOrder?.id) return { notFound: true };
      const workOrder = await getMaintenanceWorkOrderById(organizationId, updated.workOrder.id);
      if (!workOrder) return { notFound: true };

      const removedOpenImages = findRemovedLocalBucketUrls(updated.previousOpenImages, workOrder.open_images);
      for (const imageUrl of removedOpenImages) {
        await deleteLocalBucketObjectByPublicUrl(imageUrl).catch(() => {});
      }

      return { workOrder };
    })
    .then((result) => {
      if (result.invalidImage) return res.status(400).json({ message: 'Invalid open_images. Use /api/public/files URL, http(s) URL, or data:image payload.' });
      if (result.badFirm) return res.status(404).json({ message: 'Assigned firm not found' });
      if (result.badEmployee) return res.status(404).json({ message: 'Assigned employee not found' });
      if (result.notFound) return res.status(404).json({ message: 'Maintenance work order not found' });
      if (result.invalidStatus) return res.status(409).json({ message: 'Completed or cancelled work orders cannot be updated' });
      if (result.invalidTime) return res.status(400).json({ message: 'Invalid asset state transition time' });
      return res.status(200).json({ workOrder: result.workOrder });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update maintenance work order' }));
});

const startSchema = z.object({
  started_at: z.string().datetime().optional().nullable(),
  requested_state: z.enum(['MAINTENANCE', 'DOWN']).optional().nullable()
});

router.post('/organizations/:id/assets/:assetId/maintenance-work-orders/:workOrderId/start', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  const workOrderId = Number(req.params.workOrderId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });
  if (!Number.isFinite(workOrderId)) return res.status(400).json({ message: 'Invalid work order id' });

  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const updated = await db.transaction(async (trx) => {
        const existing = await trx('maintenance_work_orders')
          .where({ id: workOrderId, organization_id: organizationId, asset_id: assetId })
          .forUpdate()
          .first(['id', 'status']);
        if (!existing) return { notFound: true };
        if (existing.status !== 'OPEN') return { invalidStatus: true };

        const workOrder = await startMaintenanceWorkOrder(trx, {
          organizationId,
          workOrderId,
          startedAt: parsed.data.started_at ? new Date(parsed.data.started_at) : new Date()
        });

        if (parsed.data.requested_state) {
          const stateResult = await transitionAssetState(trx, {
            organizationId,
            assetId,
            toState: parsed.data.requested_state,
            occurredAt: parsed.data.started_at ? new Date(parsed.data.started_at) : new Date(),
            note: `Maintenance work order #${workOrderId} started`
          });
          if (stateResult.invalidTime) return { invalidTime: true };
        }

        return workOrder;
      });

      if (updated?.notFound || updated?.invalidStatus || updated?.invalidTime) return updated;
      const workOrder = await getMaintenanceWorkOrderById(organizationId, updated.id);
      return { workOrder };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Maintenance work order not found' });
      if (result.invalidStatus) return res.status(409).json({ message: 'Only open work orders can be started' });
      if (result.invalidTime) return res.status(400).json({ message: 'Invalid asset state transition time' });
      return res.status(200).json({ workOrder: result.workOrder });
    })
    .catch(() => res.status(500).json({ message: 'Failed to start maintenance work order' }));
});

const completePartSchema = z.object({
  inventory_item_id: z.number().int().positive(),
  source_node_id: z.number().int().positive(),
  quantity: z.number().positive(),
  note: z.string().max(8000).optional().nullable()
});

const completeSchema = z.object({
  root_cause: z.string().max(8000).optional().nullable(),
  resolution_note: z.string().max(8000).optional().nullable(),
  close_images: maintenanceImagesSchema.optional(),
  invoice_no: z.string().max(128).optional().nullable(),
  invoice_amount: z.number().nonnegative().optional().nullable(),
  completed_at: z.string().datetime().optional().nullable(),
  to_asset_state: z.enum(['STOPPED', 'RUNNING', 'MAINTENANCE', 'DOWN']).optional().nullable(),
  parts: z.array(completePartSchema).max(50).optional().default([])
});

router.post('/organizations/:id/assets/:assetId/maintenance-work-orders/:workOrderId/complete', (req, res) => {
  const organizationId = req.organizationId;
  const assetId = Number(req.params.assetId);
  const workOrderId = Number(req.params.workOrderId);
  if (!Number.isFinite(assetId)) return res.status(400).json({ message: 'Invalid asset id' });
  if (!Number.isFinite(workOrderId)) return res.status(400).json({ message: 'Invalid work order id' });

  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const completedAt = parsed.data.completed_at ? new Date(parsed.data.completed_at) : new Date();
      const closeImagesResult =
        parsed.data.close_images !== undefined
          ? await resolveMaintenanceImageUrls({
              organizationId,
              imageUrls: parsed.data.close_images,
              scope: 'maintenance-work-orders/close',
              entityId: String(workOrderId)
            })
          : null;
      if (closeImagesResult?.invalidImage) return { invalidImage: true };

      const updated = await db.transaction(async (trx) => {
        const existing = await trx('maintenance_work_orders')
          .where({ id: workOrderId, organization_id: organizationId, asset_id: assetId })
          .forUpdate()
          .first(['id', 'status', 'close_images_json']);
        if (!existing) return { notFound: true };
        if (existing.status === 'DONE' || existing.status === 'CANCELLED') return { invalidStatus: true };

        const parts = parsed.data.parts ?? [];
        const validatedParts = [];
        if (parts.length > 0) {
          const itemIds = Array.from(new Set(parts.map((part) => part.inventory_item_id)));
          const sourceNodeIds = Array.from(new Set(parts.map((part) => part.source_node_id)));

          const [items, sourceNodes] = await Promise.all([
            trx('inventory_items as ii')
              .leftJoin({ wt: 'warehouse_types' }, function joinWarehouseType() {
                this.on('wt.id', '=', 'ii.warehouse_type_id').andOn('wt.organization_id', '=', 'ii.organization_id');
              })
              .where('ii.organization_id', organizationId)
              .whereIn('ii.id', itemIds)
              .select(['ii.id', 'ii.amount_unit_id', db.raw('upper(wt.code) as warehouse_type_code')]),
            trx('nodes')
              .where({ organization_id: organizationId })
              .whereIn('id', sourceNodeIds)
              .select(['id', 'node_type'])
          ]);

          const itemById = new Map(items.map((row) => [row.id, row]));
          const nodeById = new Map(sourceNodes.map((row) => [row.id, row]));

          for (const part of parts) {
            const item = itemById.get(part.inventory_item_id);
            if (!item) return { badItem: true };
            if (String(item.warehouse_type_code ?? '') !== 'SPARE_PART') return { badItemType: true };

            const sourceNode = nodeById.get(part.source_node_id);
            if (!sourceNode) return { badSourceNode: true };
            if (String(sourceNode.node_type ?? '').toUpperCase() !== 'WAREHOUSE') return { badSourceNodeType: true };

            validatedParts.push({
              inventoryItemId: part.inventory_item_id,
              unitId: item.amount_unit_id,
              sourceNodeId: part.source_node_id,
              quantity: part.quantity,
              note: part.note?.trim() || null
            });
          }
        }

        let movementEventId = null;
        if (validatedParts.length > 0) {
          const assetSnapshot = await trx('assets')
            .where({ id: assetId, organization_id: organizationId })
            .first(['id', 'location_id']);
          if (!assetSnapshot?.location_id) return { missingAssetLocationNode: true };

          const locationNode = await trx('nodes')
            .where({
              organization_id: organizationId,
              node_type: 'LOCATION',
              ref_table: 'locations',
              ref_id: String(assetSnapshot.location_id)
            })
            .first(['id']);
          if (!locationNode) return { missingAssetLocationNode: true };

          const movement = await createMovementEvent(trx, {
            organizationId,
            eventType: 'TRANSFER',
            status: 'POSTED',
            occurredAt: completedAt,
            referenceType: 'MAINTENANCE_WORK_ORDER',
            referenceId: String(workOrderId),
            note: `Maintenance work order #${workOrderId}`,
            createdByUserId: null,
            lines: validatedParts.map((part) => ({
              inventoryItemId: part.inventoryItemId,
              unitId: part.unitId,
              fromNodeId: part.sourceNodeId,
              toNodeId: locationNode.id,
              quantity: part.quantity,
              unitPrice: null,
              currencyCode: null
            }))
          });
          movementEventId = movement.event.id;

          await insertMaintenanceWorkOrderParts(trx, {
            organizationId,
            workOrderId,
            movementEventId,
            parts: validatedParts
          });
        }

        const workOrder = await completeMaintenanceWorkOrder(trx, {
          organizationId,
          workOrderId,
          rootCause: parsed.data.root_cause?.trim() || null,
          resolutionNote: parsed.data.resolution_note?.trim() || null,
          closeImagesJson: closeImagesResult?.imageUrls,
          invoiceNo: parsed.data.invoice_no === undefined ? undefined : parsed.data.invoice_no?.trim() || null,
          invoiceAmount: parsed.data.invoice_amount,
          completedAt,
          closedByUserId: null
        });

        const targetAssetState = parsed.data.to_asset_state ?? 'STOPPED';
        const stateResult = await transitionAssetState(trx, {
          organizationId,
          assetId,
          toState: targetAssetState,
          occurredAt: completedAt,
          note: `Maintenance work order #${workOrderId} completed`
        });
        if (stateResult.invalidTime) return { invalidTime: true };
        if (stateResult.notFoundAsset) return { notFound: true };

        return {
          workOrder,
          movementEventId,
          previousCloseImages: normalizeMaintenanceImageList(existing.close_images_json)
        };
      });

      if (
        updated?.notFound ||
        updated?.invalidStatus ||
        updated?.missingAssetLocationNode ||
        updated?.badItem ||
        updated?.badItemType ||
        updated?.badSourceNode ||
        updated?.badSourceNodeType ||
        updated?.invalidTime
      ) {
        return updated;
      }
      if (!updated?.workOrder?.id) return { notFound: true };

      const [workOrder, parts] = await Promise.all([
        getMaintenanceWorkOrderById(organizationId, updated.workOrder.id),
        listMaintenanceWorkOrderParts(organizationId, workOrderId)
      ]);
      if (!workOrder) return { notFound: true };

      const removedCloseImages = findRemovedLocalBucketUrls(updated.previousCloseImages, workOrder.close_images);
      for (const imageUrl of removedCloseImages) {
        await deleteLocalBucketObjectByPublicUrl(imageUrl).catch(() => {});
      }

      return { workOrder, parts };
    })
    .then((result) => {
      if (result.invalidImage) return res.status(400).json({ message: 'Invalid close_images. Use /api/public/files URL, http(s) URL, or data:image payload.' });
      if (result.notFound) return res.status(404).json({ message: 'Maintenance work order not found' });
      if (result.invalidStatus) return res.status(409).json({ message: 'Completed or cancelled work orders cannot be updated' });
      if (result.missingAssetLocationNode) return res.status(409).json({ message: 'Asset location node not found' });
      if (result.badItem) return res.status(404).json({ message: 'Inventory item not found' });
      if (result.badItemType) return res.status(400).json({ message: 'Only spare part items can be consumed in maintenance' });
      if (result.badSourceNode) return res.status(404).json({ message: 'Source warehouse node not found' });
      if (result.badSourceNodeType) return res.status(400).json({ message: 'Source node must be a warehouse' });
      if (result.invalidTime) return res.status(400).json({ message: 'Invalid asset state transition time' });
      return res.status(200).json({ workOrder: result.workOrder, parts: result.parts });
    })
    .catch(() => res.status(500).json({ message: 'Failed to complete maintenance work order' }));
});

export default router;
