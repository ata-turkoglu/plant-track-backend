import { Router } from 'express';

import { listNodesByOrganization } from '../models/nodes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);
const ALLOWED_NODE_TYPES = new Set(['WAREHOUSE', 'LOCATION', 'SUPPLIER', 'CUSTOMER', 'ASSET', 'VIRTUAL']);

router.get('/organizations/:id/nodes', (req, res) => {
  const organizationId = req.organizationId;

  const typesRaw = typeof req.query.types === 'string' ? req.query.types : '';
  const types = typesRaw
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);
  if (types.some((value) => !ALLOWED_NODE_TYPES.has(value))) {
    return res.status(400).json({ message: 'Invalid node types filter' });
  }

  return Promise.resolve()
    .then(() => listNodesByOrganization(organizationId, { types }))
    .then((nodes) => {
      return res.status(200).json({ nodes });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch nodes' }));
});

export default router;
