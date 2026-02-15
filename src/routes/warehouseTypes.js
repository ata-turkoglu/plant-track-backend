import { Router } from 'express';
import { listWarehouseTypesByOrganization } from '../models/warehouseTypes.js';
import db from '../db/knex.js';

const router = Router();

router.get('/organizations/:id/warehouse-types', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) {
    return res.status(400).json({ message: 'Invalid organization id' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listWarehouseTypesByOrganization(organizationId);
    })
    .then((types) => {
      if (!types) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ warehouse_types: types });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch warehouse types' }));
});

export default router;
