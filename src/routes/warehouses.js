import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import {
  listWarehousesByOrganization,
  createWarehouse,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse
} from '../models/warehouses.js';
import { getWarehouseTypeById } from '../models/warehouseTypes.js';

const router = Router();

router.get('/organizations/:id/warehouses', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listWarehousesByOrganization(organizationId);
    })
    .then((warehouses) => {
      if (!warehouses) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ warehouses });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch warehouses' }));
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  location_id: z.number().int().positive(),
  warehouse_type_id: z.number().int().positive()
});

router.post('/organizations/:id/warehouses', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const location = await db('locations')
        .where({ id: parsed.data.location_id, organization_id: organizationId })
        .first(['id']);
      if (!location) return { badLocation: true };

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badType: true };

      const warehouse = await db.transaction(async (trx) =>
        createWarehouse(trx, {
          organizationId,
          locationId: parsed.data.location_id,
          name: parsed.data.name,
          warehouseTypeId: parsed.data.warehouse_type_id
        })
      );

      return { warehouse };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.badLocation) return res.status(400).json({ message: 'Invalid location' });
      if (result.badType) return res.status(400).json({ message: 'Invalid warehouse type' });
      return res.status(201).json({ warehouse: result.warehouse });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create warehouse' }));
});

const patchSchema = z.object({
  name: z.string().min(1).max(255),
  location_id: z.number().int().positive(),
  warehouse_type_id: z.number().int().positive()
});

router.patch('/warehouses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid warehouse id' });
  }

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getWarehouseById(id);
      if (!existing) return null;

      const location = await db('locations')
        .where({ id: parsed.data.location_id, organization_id: existing.organization_id })
        .first(['id']);
      if (!location) return { badLocation: true };

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== existing.organization_id) return { badType: true };

      const updated = await db.transaction(async (trx) =>
        updateWarehouse(trx, {
          id,
          organizationId: existing.organization_id,
          locationId: parsed.data.location_id,
          name: parsed.data.name,
          warehouseTypeId: parsed.data.warehouse_type_id
        })
      );

      return updated;
    })
    .then((updated) => {
      if (!updated) return res.status(404).json({ message: 'Warehouse not found' });
      if (typeof updated === 'object' && updated !== null && 'badLocation' in updated) {
        return res.status(400).json({ message: 'Invalid location' });
      }
      if (typeof updated === 'object' && updated !== null && 'badType' in updated) {
        return res.status(400).json({ message: 'Invalid warehouse type' });
      }
      return res.status(200).json({ warehouse: updated });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update warehouse' }));
});

router.delete('/warehouses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid warehouse id' });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getWarehouseById(id);
      if (!existing) return { notFound: true };

      await db.transaction(async (trx) => {
        await deleteWarehouse(trx, { id, organizationId: existing.organization_id });
      });

      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Warehouse not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete warehouse' }));
});

export default router;
