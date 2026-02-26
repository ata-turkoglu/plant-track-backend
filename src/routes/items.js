import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listItemsByOrganization, createItem, updateItem, setItemActive } from '../models/items.js';
import { getUnitById } from '../models/units.js';
import { getWarehouseTypeById } from '../models/warehouseTypes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

const WAREHOUSE_TYPES_REQUIRING_ITEM_GROUP = new Set(['SPARE_PART', 'RAW_MATERIAL']);

router.get('/organizations/:id/items', (req, res) => {
  const organizationId = req.organizationId;
  const activeText = typeof req.query.active === 'string' ? req.query.active.trim().toLowerCase() : '';
  if (activeText && activeText !== 'true' && activeText !== 'false') {
    return res.status(400).json({ message: 'Invalid active filter. Use true or false.' });
  }
  const active = activeText ? activeText === 'true' : undefined;

  const warehouseTypeIdText = typeof req.query.warehouseTypeId === 'string' ? req.query.warehouseTypeId.trim() : '';
  const warehouseTypeId = warehouseTypeIdText ? Number(warehouseTypeIdText) : undefined;
  if (warehouseTypeIdText && (!Number.isFinite(warehouseTypeId) || warehouseTypeId <= 0)) {
    return res.status(400).json({ message: 'Invalid warehouseTypeId filter' });
  }

  const warehouseTypeCode = typeof req.query.warehouseTypeCode === 'string' ? req.query.warehouseTypeCode.trim() : undefined;

  return Promise.resolve()
    .then(() => listItemsByOrganization(organizationId, { active, warehouseTypeId, warehouseTypeCode }))
    .then((items) => {
      return res.status(200).json({ items });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch items' }));
});

const createSchema = z.object({
  warehouse_type_id: z.number().int().positive(),
  item_group_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  brand: z.string().max(255).optional().nullable(),
  model: z.string().max(255).optional().nullable(),
  size_spec: z.string().max(255).optional().nullable(),
  size_unit_id: z.number().int().positive().optional().nullable(),
  unit_id: z.number().int().positive(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/items', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      // Enforce unique (organization_id, code)
      const existing = await db('items')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (existing) return { conflict: true };

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const wtCode = String(wt.code ?? '').toUpperCase();
      const requiresGroup = WAREHOUSE_TYPES_REQUIRING_ITEM_GROUP.has(wtCode);
      const requestedGroupId = parsed.data.item_group_id ?? null;

      if (requiresGroup && !requestedGroupId) {
        return { itemGroupRequired: true };
      }

      if (requestedGroupId) {
        const group = await db('item_groups')
          .where({ id: requestedGroupId, organization_id: organizationId })
          .first(['id', 'warehouse_type_id', 'amount_unit_id', 'active']);
        if (!group) return { badItemGroup: true };
        if (!group.active) return { badItemGroup: true };
        if (group.warehouse_type_id !== wt.id) return { badItemGroup: true };

        const unit = await getUnitById(group.amount_unit_id);
        if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

        const item = await db.transaction(async (trx) =>
          createItem(trx, {
            organizationId,
            itemGroupId: group.id,
            warehouseTypeId: wt.id,
            code: parsed.data.code,
            name: parsed.data.name,
            brand: parsed.data.brand?.trim() || null,
            model: parsed.data.model?.trim() || null,
            unitId: unit.id,
            active: parsed.data.active
          })
        );

        return { item };
      }

      const unit = await getUnitById(parsed.data.unit_id);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      if (parsed.data.size_unit_id) {
        const sizeUnit = await getUnitById(parsed.data.size_unit_id);
        if (!sizeUnit || sizeUnit.organization_id !== organizationId || !sizeUnit.active) return { badSizeUnit: true };
      }

      const item = await db.transaction(async (trx) => {
        const groupRows = await trx('item_groups')
          .insert({
            organization_id: organizationId,
            warehouse_type_id: wt.id,
            amount_unit_id: unit.id,
            code: parsed.data.code,
            name: parsed.data.name,
            size_spec: parsed.data.size_spec?.trim() || null,
            size_unit_id: parsed.data.size_unit_id ?? null,
            active: parsed.data.active ?? true
          })
          .returning(['id']);

        const groupId = groupRows[0]?.id ?? null;
        if (!groupId) throw new Error('item_group_create_failed');

        return createItem(trx, {
          organizationId,
          itemGroupId: groupId,
          warehouseTypeId: wt.id,
          code: parsed.data.code,
          name: parsed.data.name,
          brand: parsed.data.brand?.trim() || null,
          model: parsed.data.model?.trim() || null,
          unitId: unit.id,
          active: parsed.data.active
        });
      });

      return { item };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Item code already exists' });
      if (result.itemGroupRequired) return res.status(400).json({ message: 'item_group_id is required for this warehouse type' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badSizeUnit) return res.status(400).json({ message: 'Invalid size unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      if (result.badItemGroup) return res.status(400).json({ message: 'Invalid item group' });
      return res.status(201).json({ item: result.item });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create item' }));
});

const updateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  brand: z.string().max(255).optional().nullable(),
  model: z.string().max(255).optional().nullable(),
  size_spec: z.string().max(255).optional().nullable(),
  size_unit_id: z.number().int().positive().optional().nullable(),
  unit_id: z.number().int().positive(),
  item_group_id: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional()
});

router.put('/organizations/:id/items/:itemId', (req, res) => {
  const organizationId = req.organizationId;
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existingItem = await db('items')
        .where({ id: itemId, organization_id: organizationId })
        .first(['id', 'code', 'warehouse_type_id', 'item_group_id']);
      if (!existingItem) return { notFoundItem: true };
      if (!existingItem.item_group_id) return { notFoundItem: true };

      // Enforce unique (organization_id, code)
      const conflict = await db('items')
        .where({ organization_id: organizationId })
        .whereNot({ id: itemId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const wt = await getWarehouseTypeById(existingItem.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };
      const wtCode = String(wt.code ?? '').toUpperCase();
      const isGroupedType = WAREHOUSE_TYPES_REQUIRING_ITEM_GROUP.has(wtCode);

      const isGroupChange = Boolean(parsed.data.item_group_id) && parsed.data.item_group_id !== existingItem.item_group_id;
      const nextItemGroupId = parsed.data.item_group_id ?? existingItem.item_group_id;

      const group = await db('item_groups')
        .where({ id: nextItemGroupId, organization_id: organizationId })
        .first(['id', 'warehouse_type_id', 'amount_unit_id', 'active', 'code', 'name', 'size_spec', 'size_unit_id']);
      if (!group) return { badItemGroup: true };
      if (isGroupChange && !group.active) return { badItemGroup: true };
      if (group.warehouse_type_id !== existingItem.warehouse_type_id) return { badItemGroup: true };

      // Grouped types: unit is owned by item group (shared).
      // Non-grouped types: unit stays item-scoped, but if item_group is 1:1 we also keep item_group unit in sync.
      const resolvedUnitId = isGroupedType || isGroupChange ? group.amount_unit_id : parsed.data.unit_id;
      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      const shouldSyncGroupFields = !isGroupedType && !isGroupChange;
      if (shouldSyncGroupFields && parsed.data.size_unit_id) {
        const sizeUnit = await getUnitById(parsed.data.size_unit_id);
        if (!sizeUnit || sizeUnit.organization_id !== organizationId || !sizeUnit.active) return { badSizeUnit: true };
      }

      const item = await db.transaction(async (trx) => {
        if (shouldSyncGroupFields) {
          const usageRows = await trx('items')
            .where({ organization_id: organizationId, item_group_id: existingItem.item_group_id })
            .count('* as count');
          const usageCount = Number(usageRows?.[0]?.count ?? 0);
          const isGroupShared = usageCount > 1;

          if (!isGroupShared) {
            await trx('item_groups')
              .where({ id: existingItem.item_group_id, organization_id: organizationId })
              .update({
                code: parsed.data.code,
                name: parsed.data.name,
                amount_unit_id: unit.id,
                size_spec: parsed.data.size_spec?.trim() || null,
                size_unit_id: parsed.data.size_unit_id ?? null,
                active: parsed.data.active ?? true,
                updated_at: trx.fn.now()
              });
          }
        }

        return updateItem(trx, {
          organizationId,
          itemId,
          itemGroupId: isGroupChange ? nextItemGroupId : null,
          code: parsed.data.code,
          name: parsed.data.name,
          brand: parsed.data.brand?.trim() || null,
          model: parsed.data.model?.trim() || null,
          unitId: unit.id,
          active: parsed.data.active ?? true
        });
      });

      return { item };
    })
    .then((result) => {
      if (result.notFoundItem) return res.status(404).json({ message: 'Item not found' });
      if (result.conflict) return res.status(409).json({ message: 'Item code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badSizeUnit) return res.status(400).json({ message: 'Invalid size unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      if (result.badItemGroup) return res.status(400).json({ message: 'Invalid item group' });
      if (!result.item) return res.status(404).json({ message: 'Item not found' });
      return res.status(200).json({ item: result.item });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update item' }));
});

router.delete('/organizations/:id/items/:itemId', (req, res) => {
  const organizationId = req.organizationId;
  const itemId = Number(req.params.itemId);
  if (!Number.isFinite(itemId)) return res.status(400).json({ message: 'Invalid item id' });

  return Promise.resolve()
    .then(async () => {
      const existingItem = await db('items').where({ id: itemId, organization_id: organizationId }).first(['id']);
      if (!existingItem) return { notFoundItem: true };

      // Soft delete (active=false) to preserve movement history.
      const deactivated = await db.transaction(async (trx) => setItemActive(trx, { organizationId, itemId, active: false }));
      if (!deactivated) return { notFoundItem: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFoundItem) return res.status(404).json({ message: 'Item not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete item' }));
});

export default router;
