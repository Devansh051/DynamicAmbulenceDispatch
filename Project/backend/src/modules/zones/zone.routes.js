import { Router } from 'express';
import {
  listZones,
  getZoneById,
  createZone,
  updateZone,
  updateZoneStatus
} from './zone.controller.js';
import {
  validateCreateZone,
  validateUpdateZone,
  validateUpdateZoneStatus
} from './zone.validation.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import validateRequest from '../../middleware/validateRequest.js';
import { USER_ROLES } from '../users/user.model.js';

const router = Router();

// View zones - ADMIN and DISPATCHER
router.get(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  listZones
);

router.get(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  getZoneById
);

// Manage zones - ADMIN only
router.post(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateCreateZone),
  createZone
);

router.patch(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateUpdateZone),
  updateZone
);

router.patch(
  '/:id/status',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateUpdateZoneStatus),
  updateZoneStatus
);

export default router;
