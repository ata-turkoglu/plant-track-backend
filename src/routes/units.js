import { Router } from 'express';
import db from '../db/knex.js';
import { listUnitsByOrganization } from '../models/units.js';

const router = Router();

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

export default router;
