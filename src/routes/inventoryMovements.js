import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { getWarehouseById } from '../models/warehouses.js';
import { getItemById } from '../models/items.js';
import { listMovementsByOrganization, createMovement, updateMovement, deleteMovement } from '../models/inventoryMovements.js';

const router = Router();

router.get('/organizations/:id/inventory-movements', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const limit = Number(req.query.limit ?? 100);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 500)) : 100;

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listMovementsByOrganization(organizationId, safeLimit);
    })
    .then((movements) => {
      if (!movements) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ movements });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch movements' }));
});

const createSchema = z.object({
  warehouse_id: z.number().int().positive(),
  location_id: z.number().int().positive().optional().nullable(),
  item_id: z.number().int().positive(),
  movement_type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']),
  quantity: z.number().positive(),
  uom: z.string().min(1).max(16),
  reference_type: z.string().max(64).optional().nullable(),
  reference_id: z.string().max(64).optional().nullable(),
  note: z.string().max(4000).optional().nullable(),
  occurred_at: z.string().datetime().optional().nullable()
});

router.post('/organizations/:id/inventory-movements', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const wh = await getWarehouseById(parsed.data.warehouse_id);
      if (!wh || wh.organization_id !== organizationId) return { badWarehouse: true };

      const item = await getItemById(parsed.data.item_id);
      if (!item || item.organization_id !== organizationId) return { badItem: true };

      if (parsed.data.location_id) {
        const loc = await db('locations')
          .where({ id: parsed.data.location_id, organization_id: organizationId })
          .first(['id']);
        if (!loc) return { badLocation: true };
      }

      const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : undefined;

      const movement = await db.transaction(async (trx) =>
        createMovement(trx, {
          organizationId,
          warehouseId: parsed.data.warehouse_id,
          locationId: parsed.data.location_id ?? null,
          itemId: parsed.data.item_id,
          movementType: parsed.data.movement_type,
          quantity: parsed.data.quantity,
          uom: parsed.data.uom,
          referenceType: parsed.data.reference_type,
          referenceId: parsed.data.reference_id,
          note: parsed.data.note,
          occurredAt,
          createdByUserId: null
        })
      );

      return { movement };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.badWarehouse) return res.status(400).json({ message: 'Invalid warehouse' });
      if (result.badItem) return res.status(400).json({ message: 'Invalid item' });
      if (result.badLocation) return res.status(400).json({ message: 'Invalid location' });
      return res.status(201).json({ movement: result.movement });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create movement' }));
});

const updateSchema = z.object({
  warehouse_id: z.number().int().positive(),
  item_id: z.number().int().positive(),
  movement_type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']),
  quantity: z.number().positive(),
  reference_type: z.string().max(64).optional().nullable(),
  reference_id: z.string().max(64).optional().nullable(),
  note: z.string().max(4000).optional().nullable(),
  occurred_at: z.string().datetime().optional().nullable()
});

router.put('/organizations/:id/inventory-movements/:movementId', (req, res) => {
  const organizationId = Number(req.params.id);
  const movementId = Number(req.params.movementId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
  if (!Number.isFinite(movementId)) return res.status(400).json({ message: 'Invalid movement id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const existing = await db('inventory_movements')
        .where({ id: movementId, organization_id: organizationId })
        .first(['id']);
      if (!existing) return { notFoundMovement: true };

      const wh = await getWarehouseById(parsed.data.warehouse_id);
      if (!wh || wh.organization_id !== organizationId) return { badWarehouse: true };

      const item = await getItemById(parsed.data.item_id);
      if (!item || item.organization_id !== organizationId) return { badItem: true };

      const occurredAt = parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : undefined;

      const movement = await db.transaction(async (trx) =>
        updateMovement(trx, {
          organizationId,
          movementId,
          warehouseId: parsed.data.warehouse_id,
          locationId: null,
          itemId: parsed.data.item_id,
          movementType: parsed.data.movement_type,
          quantity: parsed.data.quantity,
          // Keep uom consistent with item unit code.
          uom: item.uom,
          referenceType: parsed.data.reference_type,
          referenceId: parsed.data.reference_id,
          note: parsed.data.note,
          occurredAt
        })
      );

      return { movement };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundMovement) return res.status(404).json({ message: 'Movement not found' });
      if (result.badWarehouse) return res.status(400).json({ message: 'Invalid warehouse' });
      if (result.badItem) return res.status(400).json({ message: 'Invalid item' });
      if (!result.movement) return res.status(404).json({ message: 'Movement not found' });
      return res.status(200).json({ movement: result.movement });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update movement' }));
});

router.delete('/organizations/:id/inventory-movements/:movementId', (req, res) => {
  const organizationId = Number(req.params.id);
  const movementId = Number(req.params.movementId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
  if (!Number.isFinite(movementId)) return res.status(400).json({ message: 'Invalid movement id' });

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const deleted = await db.transaction(async (trx) => deleteMovement(trx, { organizationId, movementId }));
      if (!deleted) return { notFoundMovement: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundMovement) return res.status(404).json({ message: 'Movement not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete movement' }));
});

export default router;
