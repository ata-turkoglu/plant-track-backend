import { Router } from 'express';
import { listWarehouseTypesByOrganization } from '../models/warehouseTypes.js';
import { loadOrganizationContext } from '../middleware/organizationContext.js';

const router = Router();
router.use('/organizations/:id', loadOrganizationContext);

router.get('/organizations/:id/warehouse-types', (req, res) => {
  const organizationId = req.organizationId;

  return Promise.resolve()
    .then(() => listWarehouseTypesByOrganization(organizationId))
    .then((types) => {
      return res.status(200).json({ warehouse_types: types });
    })
    .catch(() => res.status(500).json({ message: 'Failed to fetch warehouse types' }));
});

export default router;
