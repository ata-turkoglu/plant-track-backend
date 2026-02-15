import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listItemsByOrganization, createItem, updateItem, setItemActive } from '../models/items.js';
import { getUnitById } from '../models/units.js';
import { getWarehouseTypeById } from '../models/warehouseTypes.js';

const router = Router();

router.get('/organizations/:id/items', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listItemsByOrganization(organizationId);
    })
    .then((items) => {
      if (!items) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ items });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch items' }));
});

const createSchema = z.object({
  // type is derived from warehouse_types.code (kept for backward compatibility).
  type: z.string().min(1).max(32).optional(),
  warehouse_type_id: z.number().int().positive(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  unit_id: z.number().int().positive(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/items', (req, res) => {
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

      // Enforce unique (organization_id, code)
      const existing = await db('items')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (existing) return { conflict: true };

      const unit = await getUnitById(parsed.data.unit_id);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const item = await db.transaction(async (trx) =>
        createItem(trx, {
          organizationId,
          warehouseTypeId: wt.id,
          type: wt.code,
          code: parsed.data.code,
          name: parsed.data.name,
          uom: unit.code,
          unitId: unit.id,
          active: parsed.data.active
        })
      );

      return { item };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.conflict) return res.status(409).json({ message: 'Item code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      return res.status(201).json({ item: result.item });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create item' }));
});

const updateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  unit_id: z.number().int().positive(),
  active: z.boolean().optional()
});

router.put('/organizations/:id/items/:itemId', (req, res) => {
  const organizationId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
  if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const existingItem = await db('items')
        .where({ id: itemId, organization_id: organizationId })
        .first(['id', 'code', 'warehouse_type_id', 'type']);
      if (!existingItem) return { notFoundItem: true };

      // Enforce unique (organization_id, code)
      const conflict = await db('items')
        .where({ organization_id: organizationId })
        .whereNot({ id: itemId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const unit = await getUnitById(parsed.data.unit_id);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      const item = await db.transaction(async (trx) =>
        updateItem(trx, {
          organizationId,
          itemId,
          code: parsed.data.code,
          name: parsed.data.name,
          uom: unit.code,
          unitId: unit.id,
          active: parsed.data.active ?? true
        })
      );

      return { item };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundItem) return res.status(404).json({ message: 'Item not found' });
      if (result.conflict) return res.status(409).json({ message: 'Item code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (!result.item) return res.status(404).json({ message: 'Item not found' });
      return res.status(200).json({ item: result.item });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update item' }));
});

router.delete('/organizations/:id/items/:itemId', (req, res) => {
  const organizationId = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });
  if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const existingItem = await db('items').where({ id: itemId, organization_id: organizationId }).first(['id']);
      if (!existingItem) return { notFoundItem: true };

      // Soft delete (active=false) to preserve movement history.
      const deactivated = await db.transaction(async (trx) => setItemActive(trx, { organizationId, itemId, active: false }));
      if (!deactivated) return { notFoundItem: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundItem) return res.status(404).json({ message: 'Item not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete item' }));
});

export default router;
