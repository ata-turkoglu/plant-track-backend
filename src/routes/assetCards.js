import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';
import { createAssetCard, deleteAssetCard, listAssetCardsByOrganization, updateAssetCard } from '../models/assetCards.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

function inferSchemaHint(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  const message = err && typeof err === 'object' && typeof err.message === 'string' ? err.message : '';

  if (
    code === '42P01' ||
    /relation .*asset_cards.* does not exist/i.test(message) ||
    /relation .*asset_card_fields.* does not exist/i.test(message) ||
    /relation .*asset_types.* does not exist/i.test(message) ||
    /relation .*asset_type_fields.* does not exist/i.test(message)
  ) {
    return 'DB schema eksik (asset cards). Backend tarafinda `npm run migrate` calistir.';
  }

  return null;
}

function isUniqueViolation(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  return code === '23505';
}

router.get('/organizations/:id/asset-cards', (req, res) => {
  const organizationId = req.organizationId;

  return Promise.resolve()
    .then(() => {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const name = typeof req.query.name === 'string' ? req.query.name : undefined;
      const hasSchemaParam = typeof req.query.hasSchema === 'string' ? req.query.hasSchema : undefined;
      const hasSchema = hasSchemaParam === undefined ? undefined : hasSchemaParam.toLowerCase() === 'true';
      return listAssetCardsByOrganization(organizationId, { q, code, name, hasSchema });
    })
    .then((assetCards) => res.status(200).json({ assetCards }))
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      return res.status(500).json({ message: 'Failed to fetch asset cards' });
    });
});

const FIELD_DATA_TYPES = ['text', 'number', 'boolean', 'date'];
const DEFAULT_ASSET_CARD_FIELDS = [
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

    const aliases = Array.isArray(raw.aliases) ? raw.aliases : undefined;
    const valueAliases = aliases
      ? aliases
          .map((a) => (typeof a === 'string' ? slugifyFieldName(a) : ''))
          .filter((a) => a && a !== name)
      : [];

    normalized.push({
      name,
      label: label || rawName || name,
      aliases: valueAliases,
      dataType: normalizeDataType(raw.data_type),
      required,
      unitId,
      sortOrder: Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : idx
    });
  }

  // ensure defaults exist
  for (const defaultField of DEFAULT_ASSET_CARD_FIELDS) {
    const has = normalized.some((f) => f.name === defaultField.name);
    if (has) continue;
    normalized.push({
      name: defaultField.name,
      label: defaultField.label,
      aliases: defaultField.aliases ?? [],
      dataType: 'text',
      required: false,
      unitId: null,
      sortOrder: normalized.length,
      isDefault: true
    });
  }

  // stable order
  return normalized
    .map((f, index) => ({
      ...f,
      sortOrder: Number.isFinite(f.sortOrder) ? f.sortOrder : index,
      isDefault: Boolean(f.isDefault)
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

const upsertSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  description: z.string().max(10_000).optional().nullable(),
  fields: z
    .array(
      z.object({
        name: z.string().optional(),
        label: z.string().optional(),
        aliases: z.array(z.string()).optional(),
        data_type: z.enum(FIELD_DATA_TYPES).optional(),
        required: z.boolean().optional(),
        unit_id: z.number().int().positive().optional().nullable(),
        sort_order: z.number().int().optional()
      })
    )
    .optional()
});

router.post('/organizations/:id/asset-cards', (req, res) => {
  const organizationId = req.organizationId;
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const exists = await db('asset_cards')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (exists) return { conflict: true };

      const fields = normalizeFields(parsed.data.fields ?? []);
      const created = await db.transaction((trx) =>
        createAssetCard(trx, {
          organizationId,
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          fields
        })
      );

      return { assetCard: created };
    })
    .then((result) => {
      if (result.conflict) return res.status(409).json({ message: 'Asset card code already exists' });
      return res.status(201).json({ assetCard: result.assetCard });
    })
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      if (isUniqueViolation(err)) return res.status(409).json({ message: 'Asset card code already exists' });
      return res.status(500).json({ message: 'Failed to create asset card' });
    });
});

router.put('/organizations/:id/asset-cards/:assetCardId', (req, res) => {
  const organizationId = req.organizationId;
  const assetCardId = Number(req.params.assetCardId);
  if (!Number.isFinite(assetCardId)) return res.status(400).json({ message: 'Invalid asset card id' });

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('asset_cards').where({ id: assetCardId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFound: true };

      const conflict = await db('asset_cards')
        .where({ organization_id: organizationId })
        .whereNot({ id: assetCardId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const fields = normalizeFields(parsed.data.fields ?? []);
      const updated = await db.transaction((trx) =>
        updateAssetCard(trx, {
          organizationId,
          assetCardId,
          code: parsed.data.code,
          name: parsed.data.name,
          description: parsed.data.description?.trim() || null,
          fields
        })
      );

      return { assetCard: updated };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset card not found' });
      if (result.conflict) return res.status(409).json({ message: 'Asset card code already exists' });
      if (!result.assetCard) return res.status(404).json({ message: 'Asset card not found' });
      return res.status(200).json({ assetCard: result.assetCard });
    })
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      if (isUniqueViolation(err)) return res.status(409).json({ message: 'Asset card code already exists' });
      return res.status(500).json({ message: 'Failed to update asset card' });
    });
});

router.delete('/organizations/:id/asset-cards/:assetCardId', (req, res) => {
  const organizationId = req.organizationId;
  const assetCardId = Number(req.params.assetCardId);
  if (!Number.isFinite(assetCardId)) return res.status(400).json({ message: 'Invalid asset card id' });

  return Promise.resolve()
    .then(async () => {
      const existing = await db('asset_cards').where({ id: assetCardId, organization_id: organizationId }).first(['id']);
      if (!existing) return { notFound: true };

      const used = await db('assets').where({ organization_id: organizationId, asset_card_id: assetCardId }).first(['id']);
      if (used) return { inUse: true };

      const deleted = await db.transaction((trx) => deleteAssetCard(trx, { organizationId, assetCardId }));
      return { deleted: Boolean(deleted) };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Asset card not found' });
      if (result.inUse) return res.status(409).json({ message: 'Asset card is in use and cannot be deleted.' });
      if (!result.deleted) return res.status(404).json({ message: 'Asset card not found' });
      return res.status(204).send();
    })
    .catch((err) => {
      const hint = inferSchemaHint(err);
      if (hint) return res.status(500).json({ message: hint });
      return res.status(500).json({ message: 'Failed to delete asset card' });
    });
});

export default router;
