import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import { createAssetType, deleteAssetType, listAssetTypesByOrganization, updateAssetType } from '../models/assetTypes.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/asset-types', (req, res) => {
  const organizationId = req.organizationId;
  const activeParam = typeof req.query.active === 'string' ? req.query.active : undefined;
  const active = activeParam === undefined ? undefined : activeParam.toLowerCase() === 'true';

  return Promise.resolve()
    .then(() => {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const name = typeof req.query.name === 'string' ? req.query.name : undefined;
      const hasSchemaParam = typeof req.query.hasSchema === 'string' ? req.query.hasSchema : undefined;
      const hasSchema = hasSchemaParam === undefined ? undefined : hasSchemaParam.toLowerCase() === 'true';
      return listAssetTypesByOrganization(organizationId, { active, q, code, name, hasSchema });
    })
    .then((assetTypes) => res.status(200).json({ assetTypes }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch asset types' }));
});

const FIELD_DATA_TYPES = ['text', 'number', 'boolean', 'date'];
const DEFAULT_ASSET_TYPE_FIELDS = [
  { name: 'marka', label: 'Marka', aliases: ['brand'] },
  { name: 'model', label: 'Model' },
  { name: 'seri_no', label: 'Seri No', aliases: ['serial_no'] }
];

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
    const active = raw.active == null ? true : Boolean(raw.active);
    const rawDataType = raw.data_type;
    const hasAny = Boolean(
      rawName ||
        label ||
        required ||
        unitId != null ||
        active === false ||
        (typeof rawDataType === 'string' && rawDataType !== 'text')
    );

    if (!hasAny) continue;
    if (!label) return { ok: false, message: 'field_label_required' };

    const name = rawName || slugifyFieldName(label);
    if (!name) return { ok: false, message: 'field_label_required' };

    normalized.push({
      name,
      label,
      isDefault: false,
      dataType: normalizeDataType(rawDataType),
      required,
      unitId,
      sortOrder: idx,
      active
    });
  }

  const seen = new Set();
  for (const row of normalized) {
    const lower = row.name.toLowerCase();
    if (seen.has(lower)) return { ok: false, message: 'field_duplicate' };
    seen.add(lower);
  }

  return { ok: true, value: normalized };
}

function ensureDefaultAssetTypeFields(rows) {
  const output = [...rows];
  const seen = new Set(output.map((row) => row.name.toLowerCase()));
  let sortOrder = output.reduce((max, row) => {
    if (!Number.isFinite(row.sortOrder)) return max;
    return Math.max(max, row.sortOrder);
  }, -1);

  for (const defaultField of DEFAULT_ASSET_TYPE_FIELDS) {
    const aliases = Array.isArray(defaultField.aliases) ? defaultField.aliases : [];
    const allNames = [defaultField.name, ...aliases];
    if (allNames.some((name) => seen.has(String(name).toLowerCase()))) continue;
    sortOrder += 1;
    output.push({
      name: defaultField.name,
      label: defaultField.label,
      isDefault: true,
      dataType: 'text',
      required: false,
      unitId: null,
      sortOrder,
      active: true
    });
    for (const name of allNames) seen.add(String(name).toLowerCase());
  }

  return output;
}

async function validateUnitIds(organizationId, fields) {
  const unitIds = [...new Set(fields.map((row) => row.unitId).filter((id) => id != null))];
  if (unitIds.length === 0) return true;

  const rows = await db('units').where({ organization_id: organizationId }).whereIn('id', unitIds).select(['id']);
  return rows.length === unitIds.length;
}

const fieldSchema = z.object({
  name: z.string().max(128).optional().nullable(),
  label: z.string().max(255).optional().nullable(),
  data_type: z.enum(FIELD_DATA_TYPES).optional().nullable(),
  required: z.boolean().optional(),
  unit_id: z.number().int().positive().optional().nullable(),
  active: z.boolean().optional()
});

const upsertSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  active: z.boolean().optional(),
  fields: z.array(fieldSchema).optional().default([])
});

router.post('/organizations/:id/asset-types', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const normalizedFields = normalizeFields(parsed.data.fields ?? []);
      if (!normalizedFields.ok) return { invalidFields: normalizedFields.message };
      const fieldsWithDefaults = ensureDefaultAssetTypeFields(normalizedFields.value);

      const validUnitIds = await validateUnitIds(organizationId, fieldsWithDefaults);
      if (!validUnitIds) return { invalidUnit: true };

      const assetType = await db.transaction((trx) =>
        createAssetType(trx, {
          organizationId,
          code: parsed.data.code,
          name: parsed.data.name,
          active: parsed.data.active,
          fields: fieldsWithDefaults
        })
      );

      return { assetType };
    })
    .then((result) => {
      if (result.invalidFields) {
        return res.status(400).json({ message: result.invalidFields });
      }
      if (result.invalidUnit) return res.status(400).json({ message: 'Invalid unit reference in fields' });
      return res.status(201).json({ assetType: result.assetType });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create asset type' }));
});

router.put('/organizations/:id/asset-types/:assetTypeId', (req, res) => {
  const organizationId = req.organizationId;
  const assetTypeId = Number(req.params.assetTypeId);
  if (!Number.isFinite(assetTypeId)) return res.status(400).json({ message: 'Invalid asset type id' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const normalizedFields = normalizeFields(parsed.data.fields ?? []);
      if (!normalizedFields.ok) return { invalidFields: normalizedFields.message };
      const fieldsWithDefaults = ensureDefaultAssetTypeFields(normalizedFields.value);

      const validUnitIds = await validateUnitIds(organizationId, fieldsWithDefaults);
      if (!validUnitIds) return { invalidUnit: true };

      const existing = await db('asset_types').where({ id: assetTypeId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFound: true };

      const assetType = await db.transaction((trx) =>
        updateAssetType(trx, {
          organizationId,
          assetTypeId,
          code: parsed.data.code,
          name: parsed.data.name,
          active: parsed.data.active,
          fields: fieldsWithDefaults
        })
      );

      return { assetType };
    })
    .then((result) => {
      if (result.invalidFields) return res.status(400).json({ message: result.invalidFields });
      if (result.invalidUnit) return res.status(400).json({ message: 'Invalid unit reference in fields' });
      if (result.notFound) return res.status(404).json({ message: 'Asset type not found' });
      if (!result.assetType) return res.status(404).json({ message: 'Asset type not found' });
      return res.status(200).json({ assetType: result.assetType });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update asset type' }));
});

router.delete('/organizations/:id/asset-types/:assetTypeId', (req, res) => {
  const organizationId = req.organizationId;
  const assetTypeId = Number(req.params.assetTypeId);
  if (!Number.isFinite(assetTypeId)) return res.status(400).json({ message: 'Invalid asset type id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('asset_types').where({ id: assetTypeId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFound: true };

      // Soft guard: prevent deletion when referenced.
      const used = await db('assets').where({ organization_id: organizationId, asset_type_id: assetTypeId }).first(['id']);
      if (used) return { conflict: true };

      await db.transaction((trx) => deleteAssetType(trx, { organizationId, assetTypeId }));
      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset type not found' });
      if (result.conflict) return res.status(409).json({ message: 'Asset type is in use' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete asset type' }));
});

export default router;
