import { Router } from 'express';
import userController from './user.controller.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import validateRequest from '../../middleware/validateRequest.js';
import {
  validateProvisionUser,
  validateUpdateStatus,
  validateUpdateRole
} from './user.validation.js';

const router = Router();

// All user management routes require authentication and ADMIN role
router.use(authenticate, authorize('ADMIN'));

// GET /api/v1/users - List users with pagination and search
router.get('/', userController.listUsers);

// GET /api/v1/users/:id - Get specific user profile
router.get('/:id', userController.getUser);

// POST /api/v1/users - Provision new user account
router.post(
  '/',
  validateRequest(validateProvisionUser),
  userController.provisionUser
);

// PATCH /api/v1/users/:id - Update user details
router.patch('/:id', userController.updateUser);

// PATCH /api/v1/users/:id/status - Update account status (ACTIVE, INACTIVE, SUSPENDED)
router.patch(
  '/:id/status',
  validateRequest(validateUpdateStatus),
  userController.updateStatus
);

// PATCH /api/v1/users/:id/role - Update user role (ADMIN, DISPATCHER, etc.)
router.patch(
  '/:id/role',
  validateRequest(validateUpdateRole),
  userController.updateRole
);

// POST /api/v1/users/:id/approve - Approve pending user account
router.post('/:id/approve', userController.approveUser);

// POST /api/v1/users/:id/reject - Reject pending user account
router.post('/:id/reject', userController.rejectUser);

export default router;
