import { Router } from 'express';
import { z } from 'zod';

import { loadOrganizationContext } from '../middleware/organizationContext.js';
import db from '../db/knex.js';
import { getUnitById } from '../models/units.js';
import {
  createInventoryItemCard,
  deleteInventoryItemCard,
  listInventoryItemCardsByOrganization,
  updateInventoryItemCard
} from '../models/inventoryItemCards.js';
import { parsePaginationQuery } from '../utils/pagination.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

function inferSchemaHint(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const message = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : '';

  if (
    code === '42P01' ||
    /relation .*inventory_item_card_fields.* does not exist/i.test(message)
  ) {
    return 'DB schema eksik (inventory item card fields). Backend tarafinda `npm run migrate` calistir.';
  }

  if (code === '42703' && /material_role/i.test(message)) {
    return 'DB schema eksik (inventory item card material role). Backend tarafinda `npm run migrate` calistir.';
  }

  return null;
}

function isUniqueViolation(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  return code === '23505';
}

const FIELD_DATA_TYPES = ['text', 'number', 'boolean', 'date'];

function normalizeDataType(value) {
  if (value === 'text' || value === 'number' || value === 'boolean' || value === 'date') return value;
  return 'text';
}

function slugifyFieldName(text) {
  const source = typeof text === 'string' ? text.trim() : '';
  if (!source) return '';

  const turkishMap = {
    Ç: 'c',
    ç: 'c',
    Ğ: 'g',
    ğ: 'g',
    İ: 'i',
    I: 'i',
    ı: 'i',
    Ö: 'o',
    ö: 'o',
    Ş: 's',
    ş: 's',
    Ü: 'u',
    ü: 'u'
  };

  const ascii = source
    .split('')
    .map((ch) => turkishMap[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  return ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeUnitId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeFields(rows) {
  const normalized = [];

  for (let idx = 0; idx < rows.length; idx += 1) {
    const raw = rows[idx] ?? {};
    const rawName = (typeof raw.name === 'string' ? raw.name : '').trim();
    const label = (typeof raw.label === 'string' ? raw.label : '').trim();
    const required = Boolean(raw.required);
    const unitId = normalizeUnitId(raw.unit_id);
    const rawDataType = raw.data_type;
    const hasAny = Boolean(
      rawName ||
        label ||
        required ||
        unitId != null ||
        (typeof rawDataType === 'string' && rawDataType !== 'text')
    );

    if (!hasAny) continue;

    const name = slugifyFieldName(rawName || label);
    if (!name) continue;

    normalized.push({
      name,
      label: label || rawName || name,
      dataType: normalizeDataType(raw.data_type),
      required,
      unitId,
      sortOrder: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : idx
    });
  }

  return normalized
    .map((field, index) => ({
      ...field,
      sortOrder: Number.isFinite(field.sortOrder) ? field.sortOrder : index
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

router.get('/organizations/:id/inventory-item-cards', (req, res) => {
  const organizationId = req.organizationId;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const name = typeof req.query.name === 'string' ? req.query.name : undefined;
  const typeName = typeof req.query.typeName === 'string' ? req.query.typeName : undefined;
  const specification = typeof req.query.specification === 'string' ? req.query.specification : undefined;
  const warehouseTypeCode = typeof req.query.warehouseTypeCode === 'string' ? req.query.warehouseTypeCode : undefined;
  const pagination = parsePaginationQuery(req.query, { defaultPageSize: 12, maxPageSize: 100 });
  const sortField = typeof req.query.sortField === 'string' ? req.query.sortField : undefined;
  const sortOrder = typeof req.query.sortOrder === 'string' ? req.query.sortOrder : undefined;

  return Promise.resolve()
    .then(() =>
      listInventoryItemCardsByOrganization(organizationId, {
        q,
        code,
        name,
        typeName,
        specification,
        warehouseTypeCode,
        sortField,
        sortOrder,
        page: pagination.enabled ? pagination.page : undefined,
        pageSize: pagination.enabled ? pagination.pageSize : undefined
      })
    )
    .then((result) => {
      if (pagination.enabled) return res.status(200).json({ inventory_item_cards: result.rows, pagination: result.pagination });
      return res.status(200).json({ inventory_item_cards: result });
    })
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      return res.status(500).json({ message: 'Failed to fetch inventory item cards' });
    });
});

const upsertSchema = z.object({
  amount_unit_id: z.number().int().positive().optional(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  type_name: z.string().trim().max(255).optional().nullable(),
  specification: z.string().trim().max(255).optional().nullable(),
  material_role: z.enum(['NORMAL', 'PACKAGING', 'CONSUMABLE']).optional(),
  fields: z
    .array(
      z.object({
        name: z.string().optional(),
        label: z.string().optional(),
        data_type: z.enum(FIELD_DATA_TYPES).optional(),
        required: z.boolean().optional(),
        unit_id: z.number().int().positive().optional().nullable(),
        sort_order: z.number().int().optional()
      })
    )
    .optional()
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
      if (!unit || unit.organization_id !== organizationId) return { badUnit: true };

      const fields = normalizeFields(parsed.data.fields ?? []);
      for (const field of fields) {
        if (!field.unitId) continue;
        const fieldUnit = await getUnitById(field.unitId);
        if (!fieldUnit || fieldUnit.organization_id !== organizationId) return { badFieldUnit: true };
      }

      const inventoryItemCard = await db.transaction((trx) =>
        createInventoryItemCard(trx, {
          organizationId,
          amountUnitId: unit.id,
          code: parsed.data.code,
          name: parsed.data.name,
          typeName: parsed.data.type_name?.trim() || null,
          specification: parsed.data.specification?.trim() || null,
          materialRole: parsed.data.material_role ?? 'NORMAL',
          fields
        })
      );

      return { inventoryItemCard };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Inventory item card code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badFieldUnit) return res.status(400).json({ message: 'Invalid field unit' });
      return res.status(201).json({ inventory_item_card: result.inventoryItemCard });
    })
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      if (isUniqueViolation(err)) return res.status(409).json({ message: 'Inventory item card code already exists' });
      return res.status(500).json({ message: 'Failed to create inventory item card' });
    });
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
        .first(['id', 'material_role']);
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
      if (!unit || unit.organization_id !== organizationId) return { badUnit: true };

      const fields = normalizeFields(parsed.data.fields ?? []);
      for (const field of fields) {
        if (!field.unitId) continue;
        const fieldUnit = await getUnitById(field.unitId);
        if (!fieldUnit || fieldUnit.organization_id !== organizationId) return { badFieldUnit: true };
      }

      const inventoryItemCard = await db.transaction((trx) =>
        updateInventoryItemCard(trx, {
          organizationId,
          inventoryItemCardId,
          amountUnitId: unit.id,
          code: parsed.data.code,
          name: parsed.data.name,
          typeName: parsed.data.type_name?.trim() || null,
          specification: parsed.data.specification?.trim() || null,
          materialRole: parsed.data.material_role ?? existing.material_role ?? 'NORMAL',
          fields
        })
      );

      return { inventoryItemCard };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Inventory item card not found' });
      if (result.conflict) return res.status(409).json({ message: 'Inventory item card code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      if (result.badFieldUnit) return res.status(400).json({ message: 'Invalid field unit' });
      if (!result.inventoryItemCard) return res.status(404).json({ message: 'Inventory item card not found' });
      return res.status(200).json({ inventory_item_card: result.inventoryItemCard });
    })
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      if (isUniqueViolation(err)) return res.status(409).json({ message: 'Inventory item card code already exists' });
      return res.status(500).json({ message: 'Failed to update inventory item card' });
    });
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
