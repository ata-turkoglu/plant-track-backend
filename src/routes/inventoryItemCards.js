import { Router } from 'express';
import { z } from 'zod';

import { loadOrganizationContext } from '../middleware/organizationContext.js';
import db from '../db/knex.js';
import { getUnitById } from '../models/units.js';
import { getWarehouseTypeById } from '../models/warehouseTypes.js';
import {
  createInventoryItemCard,
  deleteInventoryItemCard,
  listInventoryItemCardsByOrganization,
  updateInventoryItemCard
} from '../models/inventoryItemCards.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/inventory-item-cards', (req, res) => {
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
    .then(() => listInventoryItemCardsByOrganization(organizationId, { active, q, warehouseTypeId, warehouseTypeCode }))
    .then((inventoryItemCards) => res.status(200).json({ inventory_item_cards: inventoryItemCards }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch inventory item cards' }));
});

const upsertSchema = z.object({
  warehouse_type_id: z.number().int().positive(),
  amount_unit_id: z.number().int().positive().optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  type_spec: z.string().trim().max(255).optional().nullable(),
  size_spec: z.string().trim().max(255).optional().nullable(),
  size_unit_id: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/inventory-item-cards', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const conflict = await db('inventory_item_cards')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const resolvedUnitId = parsed.data.amount_unit_id;
      if (!resolvedUnitId) return { badUnit: true };

      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      if (parsed.data.size_unit_id) {
        const sizeUnit = await getUnitById(parsed.data.size_unit_id);
        if (!sizeUnit || sizeUnit.organization_id !== organizationId || !sizeUnit.active) return { badSizeUnit: true };
      }

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const inventoryItemCard = await db.transaction((trx) =>
        createInventoryItemCard(trx, {
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

      return { inventoryItemCard };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Inventory item card code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badSizeUnit) return res.status(400).json({ message: 'Invalid size unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      return res.status(201).json({ inventory_item_card: result.inventoryItemCard });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create inventory item card' }));
});

router.put('/organizations/:id/inventory-item-cards/:inventoryItemCardId', (req, res) => {
  const organizationId = req.organizationId;
  const inventoryItemCardId = Number(req.params.inventoryItemCardId);
  if (!Number.isFinite(inventoryItemCardId)) return res.status(400).json({ message: 'Invalid inventory item card id' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await db('inventory_item_cards')
        .where({ id: inventoryItemCardId, organization_id: organizationId })
        .first(['id']);
      if (!existing) return { notFound: true };

      const conflict = await db('inventory_item_cards')
        .where({ organization_id: organizationId })
        .whereNot({ id: inventoryItemCardId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const resolvedUnitId = parsed.data.amount_unit_id;
      if (!resolvedUnitId) return { badUnit: true };

      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      if (parsed.data.size_unit_id) {
        const sizeUnit = await getUnitById(parsed.data.size_unit_id);
        if (!sizeUnit || sizeUnit.organization_id !== organizationId || !sizeUnit.active) return { badSizeUnit: true };
      }

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const inventoryItemCard = await db.transaction((trx) =>
        updateInventoryItemCard(trx, {
          organizationId,
          inventoryItemCardId,
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

      return { inventoryItemCard };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Inventory item card not found' });
      if (result.conflict) return res.status(409).json({ message: 'Inventory item card code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badSizeUnit) return res.status(400).json({ message: 'Invalid size unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      if (!result.inventoryItemCard) return res.status(404).json({ message: 'Inventory item card not found' });
      return res.status(200).json({ inventory_item_card: result.inventoryItemCard });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update inventory item card' }));
});

router.delete('/organizations/:id/inventory-item-cards/:inventoryItemCardId', (req, res) => {
  const organizationId = req.organizationId;
  const inventoryItemCardId = Number(req.params.inventoryItemCardId);
  if (!Number.isFinite(inventoryItemCardId)) return res.status(400).json({ message: 'Invalid inventory item card id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('inventory_item_cards')
        .where({ id: inventoryItemCardId, organization_id: organizationId })
        .first(['id']);
      if (!existing) return { notFound: true };

      const usedByItems = await db('inventory_items')
        .where({ organization_id: organizationId, inventory_item_card_id: inventoryItemCardId })
        .first(['id']);
      if (usedByItems) return { inUse: true };

      const hasBomTable = await db.schema.hasTable('asset_bom_lines');
      if (hasBomTable) {
        const usedByBom = await db('asset_bom_lines')
          .where({ organization_id: organizationId, inventory_item_card_id: inventoryItemCardId })
          .first(['id']);
        if (usedByBom) return { inUse: true };
      }

      const deletedCount = await db.transaction((trx) =>
        deleteInventoryItemCard(trx, { organizationId, inventoryItemCardId })
      );

      return { deleted: deletedCount > 0 };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Inventory item card not found' });
      if (result.inUse) return res.status(409).json({ message: 'Inventory item card is in use' });
      if (!result.deleted) return res.status(404).json({ message: 'Inventory item card not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete inventory item card' }));
});

export default router;
