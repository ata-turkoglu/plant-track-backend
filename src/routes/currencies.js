import { Router } from 'express';
import { z } from 'zod';
import db from '../db/knex.js';
import {
  createCurrency,
  deactivateCurrency,
  getCurrencyById,
  listCurrenciesByOrganization,
  updateCurrency
} from '../models/currencies.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

const baseSchema = {
  code: z.string().trim().min(1).max(8),
  name: z.string().trim().min(1).max(64),
  symbol: z.string().trim().max(16).optional().nullable()
};

const createSchema = z.object({ ...baseSchema });
const updateSchema = z.object({ ...baseSchema, active: z.boolean().optional() });

function normalizeCode(value) {
  return value.trim().toUpperCase();
}

function isValidCode(value) {
  // ISO 4217 is 3 letters, but allow some flexibility (2-8) for internal codes.
  return /^[A-Z0-9]{2,8}$/.test(value);
}

router.get('/organizations/:id/currencies', (req, res) => {
  const organizationId = req.organizationId;

  return Promise.resolve()
    .then(() => listCurrenciesByOrganization(organizationId))
    .then((currencies) => res.status(200).json({ currencies }))
    .catch(() => res.status(500).json({ message: 'Failed to fetch currencies' }));
});

router.post('/organizations/:id/currencies', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const code = normalizeCode(parsed.data.code);
      if (!isValidCode(code)) return { invalidCode: true };
      const name = parsed.data.name.trim();
      const symbol = parsed.data.symbol?.trim() || null;

      const conflict = await db('currencies')
        .where({ organization_id: organizationId })
        .whereRaw('upper(code) = ?', [code])
        .first(['id']);
      if (conflict) return { conflict: true };

      const currency = await db.transaction((trx) =>
        createCurrency(trx, {
          organizationId,
          code,
          name,
          symbol
        })
      );

      return { currency };
    })
    .then((result) => {
      if (result.invalidCode) return res.status(400).json({ message: 'Invalid currency code' });
      if (result.conflict) return res.status(409).json({ message: 'Currency code already exists' });
      return res.status(201).json({ currency: result.currency });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create currency' }));
});

router.patch('/currencies/:id', (req, res) => {
  const currencyId = Number(req.params.id);
  if (!Number.isFinite(currencyId)) {
    return res.status(400).json({ message: 'Invalid currency id' });
  }

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getCurrencyById(currencyId);
      if (!existing) return { notFound: true };

      const code = normalizeCode(parsed.data.code);
      if (!isValidCode(code)) return { invalidCode: true };
      const name = parsed.data.name.trim();
      const symbol = parsed.data.symbol?.trim() || null;
      const active = typeof parsed.data.active === 'boolean' ? parsed.data.active : Boolean(existing.active);

      const conflict = await db('currencies')
        .where({ organization_id: existing.organization_id })
        .whereRaw('upper(code) = ?', [code])
        .whereNot({ id: currencyId })
        .first(['id']);
      if (conflict) return { conflict: true };

      const currency = await db.transaction((trx) =>
        updateCurrency(trx, {
          id: currencyId,
          organizationId: existing.organization_id,
          code,
          name,
          symbol,
          active
        })
      );

      return { currency };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Currency not found' });
      if (result.invalidCode) return res.status(400).json({ message: 'Invalid currency code' });
      if (result.conflict) return res.status(409).json({ message: 'Currency code already exists' });
      if (!result.currency) return res.status(404).json({ message: 'Currency not found' });
      return res.status(200).json({ currency: result.currency });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update currency' }));
});

router.delete('/currencies/:id', (req, res) => {
  const currencyId = Number(req.params.id);
  if (!Number.isFinite(currencyId)) {
    return res.status(400).json({ message: 'Invalid currency id' });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getCurrencyById(currencyId);
      if (!existing) return { notFound: true };
      if (existing.system) return { systemLocked: true };

      const currency = await db.transaction((trx) =>
        deactivateCurrency(trx, {
          id: currencyId,
          organizationId: existing.organization_id
        })
      );

      return { currency };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Currency not found' });
      if (result.systemLocked) return res.status(400).json({ message: 'System currency cannot be deleted' });
      if (!result.currency) return res.status(404).json({ message: 'Currency not found' });
      return res.status(200).json({ currency: result.currency });
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete currency' }));
});

export default router;

