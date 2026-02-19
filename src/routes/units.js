import { Router } from 'express';
import { z } from 'zod';
import db from '../db/knex.js';
import {
  createUnit,
  deactivateUnit,
  getUnitById,
  listUnitsByOrganization,
  updateUnit
} from '../models/units.js';

const router = Router();

const baseSchema = {
  code: z
    .string()
    .trim()
    .max(64)
    .optional()
    .nullable(),
  tr_name: z.string().trim().min(1).max(2000),
  en_name: z.string().trim().min(1).max(2000),
  tr_symbol: z.string().trim().max(2000).optional().nullable(),
  en_symbol: z.string().trim().max(2000).optional().nullable()
};

const createSchema = z.object({
  ...baseSchema
});

const updateSchema = z.object({
  ...baseSchema,
  active: z.boolean().optional()
});

function normalizeCode(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 16);
}

function normalizeEnText(value) {
  return value.trim();
}

function normalizeTranslationKey(value) {
  return value.trim().toLowerCase();
}

async function upsertUnitSymbolTranslations(trx, { organizationId, symbolKey, tr, en }) {
  if (!symbolKey) return;
  await trx('translations')
    .insert({
      organization_id: organizationId,
      namespace: 'unit_symbol',
      entry_key: symbolKey,
      tr,
      en
    })
    .onConflict(['organization_id', 'namespace', 'entry_key'])
    .merge({ tr, en, updated_at: trx.fn.now() });
}

router.get('/organizations/:id/units', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listUnitsByOrganization(organizationId);
    })
    .then((units) => {
      if (!units) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ units });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch units' }));
});

router.post('/organizations/:id/units', (req, res) => {
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

      const codeSource = parsed.data.en_name;
      const code = normalizeCode(codeSource);
      if (!code) return { invalidCode: true };
      const enName = normalizeEnText(parsed.data.en_name);
      const trName = parsed.data.tr_name.trim();

      const rawEnSymbol = parsed.data.en_symbol?.trim() || null;
      const rawTrSymbol = parsed.data.tr_symbol?.trim() || null;

      const symbolEn = code === 'piece' ? null : rawEnSymbol ? rawEnSymbol : null;
      const symbolTr = code === 'piece' ? null : rawTrSymbol;
      const symbolKey = symbolEn ? normalizeTranslationKey(symbolEn) : null;

      if ((symbolEn && !symbolTr) || (!symbolEn && symbolTr)) {
        return { missingSymbolTranslations: true };
      }

      const conflict = await db('units')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = ?', [code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const unit = await db.transaction(async (trx) => {
        const created = await createUnit(trx, {
          organizationId,
          code,
          name: enName,
          symbol: symbolEn
        });

        await trx('translations')
          .insert({
            organization_id: organizationId,
            namespace: 'unit',
            entry_key: code,
            tr: trName,
            en: enName
          })
          .onConflict(['organization_id', 'namespace', 'entry_key'])
          .merge({ tr: trName, en: enName, updated_at: trx.fn.now() });

        if (symbolEn && symbolTr) {
          await upsertUnitSymbolTranslations(trx, {
            organizationId,
            symbolKey,
            tr: symbolTr,
            en: symbolEn
          });
        }

        return created;
      });

      return { unit };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.conflict) return res.status(409).json({ message: 'Unit code already exists' });
      if (result.invalidCode) return res.status(400).json({ message: 'Invalid EN name for code generation' });
      if (result.missingSymbolTranslations) return res.status(400).json({ message: 'TR and EN symbol are required together' });
      return res.status(201).json({ unit: result.unit });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create unit' }));
});

router.patch('/units/:id', (req, res) => {
  const unitId = Number(req.params.id);
  if (!Number.isFinite(unitId)) {
    return res.status(400).json({ message: 'Invalid unit id' });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getUnitById(unitId);
      if (!existing) return { notFound: true };

      const codeSource = parsed.data.en_name;
      const code = normalizeCode(codeSource);
      if (!code) return { invalidCode: true };
      const enName = normalizeEnText(parsed.data.en_name);
      const trName = parsed.data.tr_name.trim();

      const rawEnSymbol = parsed.data.en_symbol?.trim() || null;
      const rawTrSymbol = parsed.data.tr_symbol?.trim() || null;

      const symbolEn = code === 'piece' ? null : rawEnSymbol ? rawEnSymbol : null;
      const symbolTr = code === 'piece' ? null : rawTrSymbol;
      const symbolKey = symbolEn ? normalizeTranslationKey(symbolEn) : null;
      const oldSymbolKey = existing.symbol ? normalizeTranslationKey(String(existing.symbol)) : null;

      if ((symbolEn && !symbolTr) || (!symbolEn && symbolTr)) {
        return { missingSymbolTranslations: true };
      }

      const conflict = await db('units')
        .where({ organization_id: existing.organization_id })
        .whereRaw('lower(code) = ?', [code])
        .whereNot({ id: unitId })
        .first(['id']);
      if (conflict) return { conflict: true };

      const unit = await db.transaction(async (trx) => {
        const oldCode = String(existing.code).toLowerCase();

        if (oldCode !== code) {
          await trx('translations')
            .where({ organization_id: existing.organization_id, namespace: 'unit', entry_key: oldCode })
            .del();
        }

        await trx('translations')
          .insert({
            organization_id: existing.organization_id,
            namespace: 'unit',
            entry_key: code,
            tr: trName,
            en: enName
          })
          .onConflict(['organization_id', 'namespace', 'entry_key'])
          .merge({ tr: trName, en: enName, updated_at: trx.fn.now() });

        if (symbolEn && symbolTr) {
          if (oldCode !== code) {
            await trx('translations')
              .where({ organization_id: existing.organization_id, namespace: 'unit_symbol', entry_key: oldCode })
              .del();
          }
          if (oldSymbolKey && oldSymbolKey !== symbolKey) {
            await trx('translations')
              .where({ organization_id: existing.organization_id, namespace: 'unit_symbol', entry_key: oldSymbolKey })
              .del();
          }

          await upsertUnitSymbolTranslations(trx, {
            organizationId: existing.organization_id,
            symbolKey,
            tr: symbolTr,
            en: symbolEn
          });
        } else {
          const staleKeys = [oldCode, code, oldSymbolKey].filter((value, index, arr) => value && arr.indexOf(value) === index);
          if (staleKeys.length > 0) {
            await trx('translations')
              .where({ organization_id: existing.organization_id, namespace: 'unit_symbol' })
              .whereIn('entry_key', staleKeys)
              .del();
          }
        }

        return updateUnit(trx, {
          id: unitId,
          organizationId: existing.organization_id,
          code,
          name: enName,
          symbol: symbolEn,
          active: parsed.data.active ?? true
        });
      });

      return { unit };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Unit not found' });
      if (result.conflict) return res.status(409).json({ message: 'Unit code already exists' });
      if (result.invalidCode) return res.status(400).json({ message: 'Invalid EN name for code generation' });
      if (result.missingSymbolTranslations) return res.status(400).json({ message: 'TR and EN symbol are required together' });
      if (!result.unit) return res.status(404).json({ message: 'Unit not found' });
      return res.status(200).json({ unit: result.unit });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update unit' }));
});

router.delete('/units/:id', (req, res) => {
  const unitId = Number(req.params.id);
  if (!Number.isFinite(unitId)) {
    return res.status(400).json({ message: 'Invalid unit id' });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getUnitById(unitId);
      if (!existing) return { notFound: true };
      if (existing.system) return { systemLocked: true };

      const unit = await db.transaction((trx) =>
        deactivateUnit(trx, {
          id: unitId,
          organizationId: existing.organization_id
        })
      );

      return { unit };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Unit not found' });
      if (result.systemLocked) return res.status(400).json({ message: 'System unit cannot be deleted' });
      if (!result.unit) return res.status(404).json({ message: 'Unit not found' });
      return res.status(200).json({ unit: result.unit });
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete unit' }));
});

export default router;
