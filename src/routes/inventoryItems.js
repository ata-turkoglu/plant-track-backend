import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listInventoryItemsByOrganization, createInventoryItem, updateInventoryItem, setInventoryItemActive } from '../models/inventoryItems.js';
import { getInventoryItemCardById } from '../models/inventoryItemCards.js';
import { getUnitById } from '../models/units.js';
import { getWarehouseTypeById } from '../models/warehouseTypes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import { parsePaginationQuery } from '../utils/pagination.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

const WAREHOUSE_TYPES_REQUIRING_INVENTORY_ITEM_CARD = new Set(['SPARE_PART', 'RAW_MATERIAL']);
const FIELD_DATA_TYPES = new Set(['text', 'number', 'boolean', 'date']);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeFieldType(value) {
  return FIELD_DATA_TYPES.has(value) ? value : 'text';
}

function normalizeInventoryItemAttributesBySchema(attributesJson, schemaRows) {
  if (schemaRows.length === 0) return { ok: true, value: null };
  if (attributesJson != null && !isPlainObject(attributesJson)) {
    return { ok: false, message: 'attributes_json must be an object for selected inventory item card fields' };
  }

  const source = isPlainObject(attributesJson) ? attributesJson : {};
  const normalized = {};

  for (const rawField of schemaRows) {
    if (rawField?.active === false) continue;
    const key = typeof rawField?.name === 'string' ? rawField.name.trim() : '';
    if (!key) continue;

    const label = typeof rawField?.label === 'string' && rawField.label.trim() ? rawField.label.trim() : key;
    const required = Boolean(rawField?.required);
    const dataType = normalizeFieldType(rawField?.data_type);
    const rawValue = source[key];

    if (rawValue == null || rawValue === '') {
      if (required) return { ok: false, message: `${label} is required` };
      continue;
    }

    if (dataType === 'number') {
      const parsed = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
      if (!Number.isFinite(parsed)) return { ok: false, message: `${label} must be a number` };
      normalized[key] = parsed;
      continue;
    }

    if (dataType === 'boolean') {
      if (typeof rawValue === 'boolean') {
        normalized[key] = rawValue;
        continue;
      }
      if (rawValue === 'true' || rawValue === 'false') {
        normalized[key] = rawValue === 'true';
        continue;
      }
      return { ok: false, message: `${label} must be true or false` };
    }

    if (dataType === 'date') {
      const text = String(rawValue).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return { ok: false, message: `${label} must be a valid date` };
      normalized[key] = text;
      continue;
    }

    const text = String(rawValue).trim();
    if (!text) {
      if (required) return { ok: false, message: `${label} is required` };
      continue;
    }
    normalized[key] = text;
  }

  return { ok: true, value: Object.keys(normalized).length > 0 ? normalized : null };
}

router.get('/organizations/:id/inventory-items', (req, res) => {
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
  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 12, maxPageSize: 100 });
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const name = typeof req.query.name === 'string' ? req.query.name : undefined;
  const description = typeof req.query.description === 'string' ? req.query.description : undefined;
  const brand = typeof req.query.brand === 'string' ? req.query.brand : undefined;
  const model = typeof req.query.model === 'string' ? req.query.model : undefined;
  const typeName = typeof req.query.typeName === 'string' ? req.query.typeName : undefined;
  const specification = typeof req.query.specification === 'string' ? req.query.specification : undefined;
  const sortField = typeof req.query.sortField === 'string' ? req.query.sortField : undefined;
  const sortOrder = typeof req.query.sortOrder === 'string' ? req.query.sortOrder : undefined;

  return Promise.resolve()
    .then(() =>
      listInventoryItemsByOrganization(organizationId, {
        active,
        warehouseTypeId,
        warehouseTypeCode,
        q,
        code,
        name,
        description,
        brand,
        model,
        typeName,
        specification,
        sortField,
        sortOrder,
        page: pagination.enabled ? pagination.page : undefined,
        pageSize: pagination.enabled ? pagination.pageSize : undefined
      })
    )
    .then((result) => {
      if (pagination.enabled) return res.status(200).json({ inventory_items: result.rows, pagination: result.pagination });
      return res.status(200).json({ inventory_items: result });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch inventory items' }));
});

const createSchema = z.object({
  warehouse_type_id: z.number().int().positive(),
  inventory_item_card_id: z.number().int().positive().optional().nullable(),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(10_000).optional().nullable(),
  brand: z.string().max(255).optional().nullable(),
  model: z.string().max(255).optional().nullable(),
  attributes_json: z.unknown().optional().nullable(),
  specification: z.string().max(255).optional().nullable(),
  type_name: z.string().max(255).optional().nullable(),
  amount_unit_id: z.number().int().positive().optional(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/inventory-items', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      // Enforce unique (organization_id, code)
      const existing = await db('inventory_items')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (existing) return { conflict: true };

      const wt = await getWarehouseTypeById(parsed.data.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };

      const wtCode = String(wt.code ?? '').toUpperCase();
      const requiresCard = WAREHOUSE_TYPES_REQUIRING_INVENTORY_ITEM_CARD.has(wtCode);
      const requestedCardId = parsed.data.inventory_item_card_id ?? null;

      if (requiresCard && !requestedCardId) {
        return { inventoryCardRequired: true };
      }

      if (requestedCardId) {
        const card = await getInventoryItemCardById(requestedCardId);
        if (!card) return { badInventoryCard: true };
        if (card.organization_id !== organizationId) return { badInventoryCard: true };
        if (!card.active) return { badInventoryCard: true };
        if (card.warehouse_type_id !== wt.id) return { badInventoryCard: true };

        const unit = await getUnitById(card.amount_unit_id);
        if (!unit || unit.organization_id !== organizationId) return { badUnit: true };
        const normalizedAttr = normalizeInventoryItemAttributesBySchema(parsed.data.attributes_json ?? null, card.fields ?? []);
        if (!normalizedAttr.ok) return { badAttributes: normalizedAttr.message };

        const inventoryItem = await db.transaction(async (trx) =>
          createInventoryItem(trx, {
            organizationId,
            inventoryItemCardId: card.id,
            warehouseTypeId: wt.id,
            code: parsed.data.code,
            name: parsed.data.name,
            description: parsed.data.description?.trim() || null,
            brand: parsed.data.brand?.trim() || null,
            model: parsed.data.model?.trim() || null,
            attributesJson: normalizedAttr.value,
            unitId: unit.id,
            active: parsed.data.active
          })
        );

        return { inventoryItem };
      }

      const resolvedUnitId = parsed.data.amount_unit_id;
      if (!resolvedUnitId) return { badUnit: true };

      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId) return { badUnit: true };

      const inventoryItem = await db.transaction(async (trx) => {
        const cardRows = await trx('inventory_item_cards')
          .insert({
            organization_id: organizationId,
            warehouse_type_id: wt.id,
            amount_unit_id: unit.id,
            code: parsed.data.code,
            name: parsed.data.name,
            type_name: parsed.data.type_name?.trim() || null,
            specification: parsed.data.specification?.trim() || null,
            active: parsed.data.active ?? true
          })
          .returning(['id']);

        const cardId = cardRows[0]?.id ?? null;
        if (!cardId) throw new Error('inventory_item_card_create_failed');

        return createInventoryItem(trx, {
          organizationId,
          inventoryItemCardId: cardId,
          warehouseTypeId: wt.id,
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          brand: parsed.data.brand?.trim() || null,
          model: parsed.data.model?.trim() || null,
          attributesJson: null,
          unitId: unit.id,
          active: parsed.data.active
        });
      });

      return { inventoryItem };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Inventory item code already exists' });
      if (result.inventoryCardRequired) return res.status(400).json({ message: 'inventory_item_card_id is required for this warehouse type' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      if (result.badInventoryCard) return res.status(400).json({ message: 'Invalid inventory card' });
      if (result.badAttributes) return res.status(400).json({ message: result.badAttributes });
      return res.status(201).json({ inventory_item: result.inventoryItem });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create inventory item' }));
});

const updateSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(10_000).optional().nullable(),
  brand: z.string().max(255).optional().nullable(),
  model: z.string().max(255).optional().nullable(),
  attributes_json: z.unknown().optional().nullable(),
  specification: z.string().max(255).optional().nullable(),
  type_name: z.string().max(255).optional().nullable(),
  amount_unit_id: z.number().int().positive().optional(),
  inventory_item_card_id: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional()
});

router.put('/organizations/:id/inventory-items/:inventoryItemId', (req, res) => {
  const organizationId = req.organizationId;
  const inventoryItemId = Number(req.params.inventoryItemId);
  if (!Number.isFinite(inventoryItemId)) return res.status(400).json({ message: 'Invalid inventory item id' });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existingItem = await db('inventory_items')
        .where({ id: inventoryItemId, organization_id: organizationId })
        .first(['id', 'code', 'warehouse_type_id', 'inventory_item_card_id']);
      if (!existingItem) return { notFoundInventoryItem: true };
      if (!existingItem.inventory_item_card_id) return { notFoundInventoryItem: true };

      // Enforce unique (organization_id, code)
      const conflict = await db('inventory_items')
        .where({ organization_id: organizationId })
        .whereNot({ id: inventoryItemId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const wt = await getWarehouseTypeById(existingItem.warehouse_type_id);
      if (!wt || wt.organization_id !== organizationId) return { badWarehouseType: true };
      const wtCode = String(wt.code ?? '').toUpperCase();
      const isCardScopedType = WAREHOUSE_TYPES_REQUIRING_INVENTORY_ITEM_CARD.has(wtCode);

      const isCardChange = Boolean(parsed.data.inventory_item_card_id) && parsed.data.inventory_item_card_id !== existingItem.inventory_item_card_id;
      const nextInventoryCardId = parsed.data.inventory_item_card_id ?? existingItem.inventory_item_card_id;

      const card = await getInventoryItemCardById(nextInventoryCardId);
      if (!card) return { badInventoryCard: true };
      if (card.organization_id !== organizationId) return { badInventoryCard: true };
      if (isCardChange && !card.active) return { badInventoryCard: true };
      if (card.warehouse_type_id !== existingItem.warehouse_type_id) return { badInventoryCard: true };

      const requestedUnitId = parsed.data.amount_unit_id;
      const resolvedUnitId = isCardScopedType || isCardChange ? card.amount_unit_id : requestedUnitId;
      if (!resolvedUnitId) return { badUnit: true };
      const unit = await getUnitById(resolvedUnitId);
      if (!unit || unit.organization_id !== organizationId) return { badUnit: true };
      const normalizedAttr = normalizeInventoryItemAttributesBySchema(parsed.data.attributes_json ?? null, card.fields ?? []);
      if (!normalizedAttr.ok) return { badAttributes: normalizedAttr.message };

      const inventoryItem = await db.transaction(async (trx) => {
        if (!isCardScopedType && !isCardChange) {
          const usageRows = await trx('inventory_items')
            .where({ organization_id: organizationId, inventory_item_card_id: existingItem.inventory_item_card_id })
            .count('* as count');
          const usageCount = Number(usageRows?.[0]?.count ?? 0);
          const isCardShared = usageCount > 1;

          if (!isCardShared) {
            await trx('inventory_item_cards')
              .where({ id: existingItem.inventory_item_card_id, organization_id: organizationId })
              .update({
                code: parsed.data.code,
                name: parsed.data.name,
                amount_unit_id: unit.id,
                type_name: parsed.data.type_name?.trim() || null,
                specification: parsed.data.specification?.trim() || null,
                active: parsed.data.active ?? true,
                updated_at: trx.fn.now()
              });
          }
        }

        return updateInventoryItem(trx, {
          organizationId,
          inventoryItemId,
          inventoryItemCardId: isCardChange ? nextInventoryCardId : null,
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          brand: parsed.data.brand?.trim() || null,
          model: parsed.data.model?.trim() || null,
          attributesJson: normalizedAttr.value,
          unitId: unit.id,
          active: parsed.data.active ?? true
        });
      });

      return { inventoryItem };
    })
    .then((result) => {
      if (result.notFoundInventoryItem) return res.status(404).json({ message: 'Inventory item not found' });
      if (result.conflict) return res.status(409).json({ message: 'Inventory item code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badWarehouseType) return res.status(400).json({ message: 'Invalid warehouse type' });
      if (result.badInventoryCard) return res.status(400).json({ message: 'Invalid inventory card' });
      if (result.badAttributes) return res.status(400).json({ message: result.badAttributes });
      if (!result.inventoryItem) return res.status(404).json({ message: 'Inventory item not found' });
      return res.status(200).json({ inventory_item: result.inventoryItem });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update inventory item' }));
});

router.delete('/organizations/:id/inventory-items/:inventoryItemId', (req, res) => {
  const organizationId = req.organizationId;
  const inventoryItemId = Number(req.params.inventoryItemId);
  if (!Number.isFinite(inventoryItemId)) return res.status(400).json({ message: 'Invalid inventory item id' });

  return Promise.resolve()
    .then(async () => {
      const existingItem = await db('inventory_items').where({ id: inventoryItemId, organization_id: organizationId }).first(['id']);
      if (!existingItem) return { notFoundInventoryItem: true };

      // Soft delete (active=false) to preserve movement history.
      const deactivated = await db.transaction(async (trx) =>
        setInventoryItemActive(trx, { organizationId, inventoryItemId, active: false })
      );
      if (!deactivated) return { notFoundInventoryItem: true };
      return { ok: true };
    })
    .then((result) => {
      if (result.notFoundInventoryItem) return res.status(404).json({ message: 'Inventory item not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete inventory item' }));
});

export default router;
