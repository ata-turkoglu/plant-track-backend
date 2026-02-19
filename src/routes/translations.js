import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import {
  createTranslation,
  deleteTranslationById,
  getTranslationById,
  listTranslationsByOrganization,
  updateTranslation
} from '../models/translations.js';

const router = Router();

const upsertSchema = z.object({
  namespace: z.string().trim().min(1).max(64),
  entry_key: z.string().trim().min(1).max(128),
  tr: z.string().trim().min(1).max(2000),
  en: z.string().trim().min(1).max(2000)
});

router.get('/organizations/:id/translations', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined;

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listTranslationsByOrganization(organizationId, { namespace });
    })
    .then((translations) => {
      if (!translations) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ translations });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch translations' }));
});

router.post('/organizations/:id/translations', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const conflict = await db('translations')
        .where({
          organization_id: organizationId,
          namespace: parsed.data.namespace,
          entry_key: parsed.data.entry_key
        })
        .first(['id']);
      if (conflict) return { conflict: true };

      const translation = await db.transaction(async (trx) =>
        createTranslation(trx, {
          organizationId,
          namespace: parsed.data.namespace,
          entryKey: parsed.data.entry_key,
          tr: parsed.data.tr,
          en: parsed.data.en
        })
      );

      return { translation };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.conflict) return res.status(409).json({ message: 'Translation already exists for this key' });
      return res.status(201).json({ translation: result.translation });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create translation' }));
});

router.put('/organizations/:id/translations/:translationId', (req, res) => {
  const organizationId = Number(req.params.id);
  const translationId = Number(req.params.translationId);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }
  if (!Number.isFinite(translationId)) {
    return res.status(400).json({ message: 'Invalid translation id' });
  }

  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const existing = await getTranslationById(translationId);
      if (!existing || existing.organization_id !== organizationId) return { notFoundTranslation: true };

      const conflict = await db('translations')
        .where({
          organization_id: organizationId,
          namespace: parsed.data.namespace,
          entry_key: parsed.data.entry_key
        })
        .whereNot({ id: translationId })
        .first(['id']);
      if (conflict) return { conflict: true };

      const translation = await db.transaction(async (trx) =>
        updateTranslation(trx, {
          organizationId,
          translationId,
          namespace: parsed.data.namespace,
          entryKey: parsed.data.entry_key,
          tr: parsed.data.tr,
          en: parsed.data.en
        })
      );

      return { translation };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundTranslation) return res.status(404).json({ message: 'Translation not found' });
      if (result.conflict) return res.status(409).json({ message: 'Translation already exists for this key' });
      if (!result.translation) return res.status(404).json({ message: 'Translation not found' });
      return res.status(200).json({ translation: result.translation });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update translation' }));
});

router.delete('/organizations/:id/translations/:translationId', (req, res) => {
  const organizationId = Number(req.params.id);
  const translationId = Number(req.params.translationId);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }
  if (!Number.isFinite(translationId)) {
    return res.status(400).json({ message: 'Invalid translation id' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const existing = await getTranslationById(translationId);
      if (!existing || existing.organization_id !== organizationId) return { notFoundTranslation: true };

      await db.transaction(async (trx) => deleteTranslationById(trx, { organizationId, translationId }));

      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.notFoundTranslation) return res.status(404).json({ message: 'Translation not found' });
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete translation' }));
});

export default router;
