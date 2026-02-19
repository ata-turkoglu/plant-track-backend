import { Router } from 'express';
import { z } from 'zod';

import db from '../db/knex.js';
import { listLocationsByOrganization, createLocation } from '../models/locations.js';
import { upsertRefNode } from '../models/nodes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id', (req, res) => {
  return res.status(200).json({ organization: req.organization });
});

const patchOrgSchema = z.object({
  name: z.string().min(2).max(255)
});

router.patch('/organizations/:id', (req, res) => {
  const id = req.organizationId;

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
  const organizationId = req.organizationId;
  return Promise.resolve()
    .then(() => listLocationsByOrganization(organizationId))
    .then((locations) => {
      return res.status(200).json({ locations });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch locations' }));
});

const createLocationSchema = z.object({
  name: z.string().min(1).max(255),
  parent_id: z.number().int().positive().optional().nullable()
});

router.post('/organizations/:id/locations', (req, res) => {
  const organizationId = req.organizationId;

  const parsed = createLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.flatten() });
  }

  return Promise.resolve()
    .then(async () => {
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
        }).then(async (created) => {
          await upsertRefNode(trx, {
            organizationId,
            nodeType: 'LOCATION',
            refTable: 'locations',
            refId: created.id,
            name: created.name,
            isStocked: true,
            metaJson: {
              parent_id: created.parent_id ?? null
            }
          });

          return created;
        })
      );

      return { location };
    })
    .then((result) => {
      if (result.badParent) return res.status(400).json({ message: 'Invalid parent location' });
      return res.status(201).json({ location: result.location });
    })
    .catch(() => res.status(500).json({ message: 'Failed to create location' }));
});

export default router;
