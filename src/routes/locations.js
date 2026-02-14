import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { getLocationById, hasChildren, updateLocation, deleteLocation } from '../models/locations.js';

const router = Router();

const patchSchema = z.object({
  name: z.string().min(1).max(255)
});

router.patch('/locations/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid location id' });
  }

  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getLocationById(id);
      if (!existing) return null;

      const updated = await db.transaction(async (trx) =>
        updateLocation(trx, {
          id,
          organizationId: existing.organization_id,
          name: parsed.data.name
        })
      );

      return updated;
    })
    .then((updated) => {
      if (!updated) return res.status(404).json({ message: 'Location not found' });
      return res.status(200).json({ location: updated });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update location' }));
});

router.delete('/locations/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid location id' });
  }

  return Promise.resolve()
    .then(async () => {
      const existing = await getLocationById(id);
      if (!existing) return { notFound: true };
      const children = await hasChildren(id);
      if (children) return { hasChildren: true };

      await db.transaction(async (trx) => {
        await deleteLocation(trx, { id, organizationId: existing.organization_id });
      });

      return { ok: true };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Location not found' });
      if (result.hasChildren) {
        return res.status(409).json({ message: 'Location has children. Delete children first.' });
      }
      return res.status(204).send();
    })
    .catch(() => res.status(500).json({ message: 'Failed to delete location' }));
});

export default router;
