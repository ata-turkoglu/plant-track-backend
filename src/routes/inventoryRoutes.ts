import { Router } from 'express';
import {
  createBusiness,
  createFactory,
  createFacility,
  createPlant,
  createProduct,
  createStockTransaction,
  createTransfer,
  createWarehouse,
  deactivateBusiness,
  deactivateFactory,
  deactivateFacility,
  deactivatePlant,
  getLedger,
  getOnHand,
  listBusinesses,
  listFactories,
  listFacilities,
  listPlants,
  listProducts,
  listWarehouses,
  updateBusiness,
  updateFactory,
  updateFacility,
  updatePlant
} from '../controllers/inventoryController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { authorizeRoles } from '../middleware/authorize';

const router = Router();

router.get('/products', authenticate, asyncHandler(listProducts));
router.post('/products', authenticate, asyncHandler(createProduct));

router.get('/warehouses', authenticate, asyncHandler(listWarehouses));
router.post('/warehouses', authenticate, asyncHandler(createWarehouse));

router.get('/businesses', authenticate, asyncHandler(listBusinesses));
router.post('/businesses', authenticate, authorizeRoles('admin'), asyncHandler(createBusiness));
router.patch('/businesses/:id', authenticate, authorizeRoles('admin'), asyncHandler(updateBusiness));
router.delete('/businesses/:id', authenticate, authorizeRoles('admin'), asyncHandler(deactivateBusiness));

router.get('/factories', authenticate, asyncHandler(listFactories));
router.post('/factories', authenticate, authorizeRoles('admin'), asyncHandler(createFactory));
router.patch('/factories/:id', authenticate, authorizeRoles('admin'), asyncHandler(updateFactory));
router.delete('/factories/:id', authenticate, authorizeRoles('admin'), asyncHandler(deactivateFactory));

router.get('/facilities', authenticate, asyncHandler(listFacilities));
router.post('/facilities', authenticate, authorizeRoles('admin'), asyncHandler(createFacility));
router.patch('/facilities/:id', authenticate, authorizeRoles('admin'), asyncHandler(updateFacility));
router.delete('/facilities/:id', authenticate, authorizeRoles('admin'), asyncHandler(deactivateFacility));

// Backward-compatible plant endpoints.
router.get('/plants', authenticate, asyncHandler(listPlants));
router.post('/plants', authenticate, authorizeRoles('admin'), asyncHandler(createPlant));
router.patch('/plants/:id', authenticate, authorizeRoles('admin'), asyncHandler(updatePlant));
router.delete('/plants/:id', authenticate, authorizeRoles('admin'), asyncHandler(deactivatePlant));

router.post('/stock/transactions', authenticate, asyncHandler(createStockTransaction));
router.post('/stock/transfers', authenticate, asyncHandler(createTransfer));
router.get('/stock/on-hand', authenticate, asyncHandler(getOnHand));
router.get('/stock/ledger', authenticate, asyncHandler(getLedger));

export default router;
