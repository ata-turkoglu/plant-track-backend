import { Router } from 'express';
import {
  createOrganization,
  createOrganizationUnit,
  createProduct,
  createStockTransaction,
  createTransfer,
  createWarehouse,
  deactivateOrganization,
  deactivateOrganizationUnit,
  getLedger,
  getOnHand,
  listOrganizations,
  listOrganizationUnits,
  listProducts,
  listWarehouses,
  updateOrganization,
  updateOrganizationUnit
} from '../controllers/inventoryController';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { authorizeRoles } from '../middleware/authorize';

const router = Router();

router.get('/products', authenticate, asyncHandler(listProducts));
router.post('/products', authenticate, asyncHandler(createProduct));

router.get('/organizations', authenticate, asyncHandler(listOrganizations));
router.post('/organizations', authenticate, authorizeRoles('admin'), asyncHandler(createOrganization));
router.patch('/organizations/:id', authenticate, authorizeRoles('admin'), asyncHandler(updateOrganization));
router.delete('/organizations/:id', authenticate, authorizeRoles('admin'), asyncHandler(deactivateOrganization));

router.get('/organization-units', authenticate, asyncHandler(listOrganizationUnits));
router.post('/organization-units', authenticate, authorizeRoles('admin'), asyncHandler(createOrganizationUnit));
router.patch('/organization-units/:id', authenticate, authorizeRoles('admin'), asyncHandler(updateOrganizationUnit));
router.delete(
  '/organization-units/:id',
  authenticate,
  authorizeRoles('admin'),
  asyncHandler(deactivateOrganizationUnit)
);

router.get('/warehouses', authenticate, asyncHandler(listWarehouses));
router.post('/warehouses', authenticate, asyncHandler(createWarehouse));

router.post('/stock/transactions', authenticate, asyncHandler(createStockTransaction));
router.post('/stock/transfers', authenticate, asyncHandler(createTransfer));
router.get('/stock/on-hand', authenticate, asyncHandler(getOnHand));
router.get('/stock/ledger', authenticate, asyncHandler(getLedger));

export default router;
