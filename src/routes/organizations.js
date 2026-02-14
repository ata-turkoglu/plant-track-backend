import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listLocationsByOrganization, createLocation } from '../models/locations.js';

const router = Router();

router.get('/organizations/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id }).first(['id', 'name', 'code']);
      if (!org) return null;
      return org;
    })
    .then((org) => {
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ organization: org });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch organization' }));
});

const patchOrgSchema = z.object({
  name: z.string().min(2).max(255)
});

router.patch('/organizations/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  const parsed = patchOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const rows = await db('organizations')
        .where({ id })
        .update({ name: parsed.data.name, updated_at: db.fn.now() })
        .returning(['id', 'name', 'code']);

      return rows[0] ?? null;
    })
    .then((org) => {
      if (!org) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ organization: org });
    })
    .catch(() => res.status(500).json({ message: 'Failed to update organization' }));
});

router.get('/organizations/:id/locations', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id }).first(['id']);
      if (!org) return null;
      const locations = await listLocationsByOrganization(id);
      return locations;
    })
    .then((locations) => {
      if (!locations) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ locations });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch locations' }));
});

const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.number().int().positive().optional().nullable()
});

router.post('/organizations/:id/locations', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  const parsed = createLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return { notFound: true };

      const parentId = parsed.data.parent_id ?? null;
      if (parentId) {
        const parent = await db('locations')
          .where({ id: parentId, organization_id: organizationId })
          .first(['id']);
        if (!parent) {
          return { badParent: true };
        }
      }

      const location = await db.transaction(async (trx) =>
        createLocation(trx, {
          organizationId,
          parentId,
          name: parsed.data.name
        })
      );

      return { location };
    })
    .then((result) => {
      if (result.notFound) return res.status(404).json({ message: 'Organization not found' });
      if (result.badParent) return res.status(400).json({ message: 'Invalid parent location' });
      return res.status(201).json({ location: result.location });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create location' }));
});

export default router;
