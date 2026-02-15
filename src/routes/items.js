import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listItemsByOrganization, createItem } from '../models/items.js';
import { getUnitById } from '../models/units.js';

const router = Router();

router.get('/organizations/:id/items', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listItemsByOrganization(organizationId);
    })
    .then((items) => {
      if (!items) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ items });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch items' }));
});

const createSchema = z.object({
  type: z.string().min(1).max(32),
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  unit_id: z.number().int().positive(),
  active: z.boolean().optional()
});

router.post('/organizations/:id/items', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      // Enforce unique (organization_id, code)
      const existing = await db('items')
        .where({ organization_id: organizationId })
        .whereRaw('lower(code) = lower(?)', [parsed.data.code])
        .first(['id']);
      if (existing) return { conflict: true };

      const unit = await getUnitById(parsed.data.unit_id);
      if (!unit || unit.organization_id !== organizationId || !unit.active) return { badUnit: true };

      const item = await db.transaction(async (trx) =>
        createItem(trx, {
          organizationId,
          type: parsed.data.type,
          code: parsed.data.code,
          name: parsed.data.name,
          uom: unit.code,
          unitId: unit.id,
          active: parsed.data.active
        })
      );

      return { item };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.conflict) return res.status(409).json({ message: 'Item code already exists' });
      if (result.badUnit) return res.status(400).json({ message: 'Invalid unit' });
      return res.status(201).json({ item: result.item });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create item' }));
});

export default router;
