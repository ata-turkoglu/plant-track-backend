import { Router } from 'express';

import db from '../db/knex.js';
import { listNodesByOrganization } from '../models/nodes.js';

const router = Router();
const ALLOWED_NODE_TYPES = new Set(['WAREHOUSE', 'LOCATION', 'SUPPLIER', 'CUSTOMER', 'ASSET', 'VIRTUAL']);

router.get('/organizations/:id/nodes', (req, res) => {
  const organizationId = Number(req.params.id);
  if (!Number.isFinite(organizationId)) return res.status(400).json({ message: 'Invalid organization id' });

  const typesRaw = typeof req.query.types === 'string' ? req.query.types : '';
  const types = typesRaw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  if (types.some((value) => !ALLOWED_NODE_TYPES.has(value))) {
    return res.status(400).json({ message: 'Invalid node types filter' });
  }

  return Promise.resolve()
    .then(async () => {
      const org = await db('organizations').where({ id: organizationId }).first(['id']);
      if (!org) return null;
      return listNodesByOrganization(organizationId, { types });
    })
    .then((nodes) => {
      if (!nodes) return res.status(404).json({ message: 'Organization not found' });
      return res.status(200).json({ nodes });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch nodes' }));
});

export default router;
