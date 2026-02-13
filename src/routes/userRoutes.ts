import { Router } from 'express';
import {
  createUser,
  deactivateUserById,
  getMe,
  getUserById,
  listUsers,
  updateMe,
  updateUserById
} from '../controllers/userController';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/auth';
import { authorizeRoles } from '../middleware/authorize';

const router = Router();

router.get('/me', authenticate, asyncHandler(getMe));
router.patch('/me', authenticate, asyncHandler(updateMe));

router.post('/', authenticate, authorizeRoles('admin'), asyncHandler(createUser));
router.get('/', authenticate, authorizeRoles('admin'), asyncHandler(listUsers));
router.get('/:id', authenticate, authorizeRoles('admin'), asyncHandler(getUserById));
router.patch('/:id', authenticate, authorizeRoles('admin'), asyncHandler(updateUserById));
router.delete('/:id', authenticate, authorizeRoles('admin'), asyncHandler(deactivateUserById));

export default router;
