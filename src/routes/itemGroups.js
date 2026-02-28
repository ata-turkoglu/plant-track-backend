import { Router } from 'express';
import { z } from 'zod';

import { loadOrganizationContext } from '../middleware/organizationContext.js';
import db from '../db/knex.js';
import { getUnitById } from '../models/units.js';
import { getWarehouseTypeById } from '../models/warehouseTypes.js';
import {
  createItemGroup,
  deleteItemGroup,
  listItemGroupsByOrganization,
  updateItemGroup
} from '../models/itemGroups.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/item-groups', (req, res) => {
  const organizationId = req.organizationId;
  const activeText = typeof req.query.active === 'string' ? req.query.active.trim().toLowerCase() : '';
  if (activeText && activeText !== 'true' && activeText !== 'false') {
    return res.status(400).json({ message: 'Invalid active filter. Use true or false.' });
  }
  const active = activeText ? activeText === 'true' : undefined;

  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const warehouseTypeId = typeof req.query.warehouseTypeId === 'string' ? req.query.warehouseTypeId : undefined;
  const warehouseTypeCode = typeof req.query.warehouseTypeCode === 'string' ? req.query.warehouseTypeCode : undefined;

  return Promise.resolve()
    .then(() => listItemGroupsByOrganization(organizationId, { active, q, warehouseTypeId, warehouseTypeCode }))
    .then((itemGroups) => res.status(200).json({ item_groups: itemGroups }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch item groups' }));
});

const upsertSchema = z.object({
  warehouse_type_id: z.number().int().positive(),
  amount_unit_id: z.number().int().positive().optional(),
  unit_id: z.number().int().positive().optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  type_spec: z.string().trim().max(255).optional().nullable(),
  size_spec: z.string().trim().max(255).optional().nullable(),
  size_unit_id: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/item-groups', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const conflict = await db('item_groups')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const resolvedUnitId = parsed.data.amount_unit_id ?? parsed.data.unit_id;
      if (!resolvedUnitId) return { badUnit: true };

      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      if (parsed.data.size_unit_id) {
        const sizeUnit = await getUnitById(parsed.data.size_unit_id);
        if (!sizeUnit || sizeUnit.organization_id !== organizationId || !sizeUnit.active) return { badSizeUnit: true };
      }

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const itemGroup = await db.transaction((trx) =>
        createItemGroup(trx, {
          organizationId,
          warehouseTypeId: wt.id,
          amountUnitId: unit.id,
          code: parsed.data.code,
          name: parsed.data.name,
          typeSpec: parsed.data.type_spec?.trim() || null,
          sizeSpec: parsed.data.size_spec?.trim() || null,
          sizeUnitId: parsed.data.size_unit_id ?? null,
          active: parsed.data.active ?? true
        })
      );

      return { itemGroup };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Item group code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badSizeUnit) return res.status(400).json({ message: 'Invalid size unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      return res.status(201).json({ item_group: result.itemGroup });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create item group' }));
});

router.put('/organizations/:id/item-groups/:itemGroupId', (req, res) => {
  const organizationId = req.organizationId;
  const itemGroupId = Number(req.params.itemGroupId);
  if (!Number.isFinite(itemGroupId)) return res.status(400).json({ message: 'Invalid item group id' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await db('item_groups')
        .where({ id: itemGroupId, organization_id: organizationId })
        .first(['id']);
      if (!existing) return { notFound: true };

      const conflict = await db('item_groups')
        .where({ organization_id: organizationId })
        .whereNot({ id: itemGroupId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const resolvedUnitId = parsed.data.amount_unit_id ?? parsed.data.unit_id;
      if (!resolvedUnitId) return { badUnit: true };

      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      if (parsed.data.size_unit_id) {
        const sizeUnit = await getUnitById(parsed.data.size_unit_id);
        if (!sizeUnit || sizeUnit.organization_id !== organizationId || !sizeUnit.active) return { badSizeUnit: true };
      }

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const itemGroup = await db.transaction((trx) =>
        updateItemGroup(trx, {
          organizationId,
          itemGroupId,
          warehouseTypeId: wt.id,
          amountUnitId: unit.id,
          code: parsed.data.code,
          name: parsed.data.name,
          typeSpec: parsed.data.type_spec?.trim() || null,
          sizeSpec: parsed.data.size_spec?.trim() || null,
          sizeUnitId: parsed.data.size_unit_id ?? null,
          active: parsed.data.active ?? true
        })
      );

      return { itemGroup };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Item group not found' });
      if (result.conflict) return res.status(409).json({ message: 'Item group code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badSizeUnit) return res.status(400).json({ message: 'Invalid size unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      if (!result.itemGroup) return res.status(404).json({ message: 'Item group not found' });
      return res.status(200).json({ item_group: result.itemGroup });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update item group' }));
});

router.delete('/organizations/:id/item-groups/:itemGroupId', (req, res) => {
  const organizationId = req.organizationId;
  const itemGroupId = Number(req.params.itemGroupId);
  if (!Number.isFinite(itemGroupId)) return res.status(400).json({ message: 'Invalid item group id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('item_groups')
        .where({ id: itemGroupId, organization_id: organizationId })
        .first(['id']);
      if (!existing) return { notFound: true };

      const usedByItems = await db('items')
        .where({ organization_id: organizationId, item_group_id: itemGroupId })
        .first(['id']);
      if (usedByItems) return { inUse: true };

      const hasBomTable = await db.schema.hasTable('asset_bom_lines');
      if (hasBomTable) {
        const usedByBom = await db('asset_bom_lines')
          .where({ organization_id: organizationId, item_group_id: itemGroupId })
          .first(['id']);
        if (usedByBom) return { inUse: true };
      }

      const deletedCount = await db.transaction((trx) =>
        deleteItemGroup(trx, { organizationId, itemGroupId })
      );

      return { deleted: deletedCount > 0 };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Item group not found' });
      if (result.inUse) return res.status(409).json({ message: 'Item group is in use' });
      if (!result.deleted) return res.status(404).json({ message: 'Item group not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete item group' }));
});

export default router;
