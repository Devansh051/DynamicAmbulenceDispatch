import { Router } from 'express';
import {
  listAmbulances,
  getAmbulanceById,
  createAmbulance,
  updateAmbulance,
  updateAmbulanceStatus
} from './ambulance.controller.js';
import {
  validateCreateAmbulance,
  validateUpdateAmbulance,
  validateUpdateAmbulanceStatus
} from './ambulance.validation.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import validateRequest from '../../middleware/validateRequest.js';
import { USER_ROLES } from '../users/user.model.js';

const router = Router();

// Directory & Details - Accessible to ADMIN, DISPATCHER, and AMBULANCE_CREW
router.get(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  listAmbulances
);

router.get(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  getAmbulanceById
);

// Commissioning & Full Updates - ADMIN only
router.post(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateCreateAmbulance),
  createAmbulance
);

router.patch(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateUpdateAmbulance),
  updateAmbulance
);

// Operational Status Updates - ADMIN and DISPATCHER
router.patch(
  '/:id/status',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  validateRequest(validateUpdateAmbulanceStatus),
  updateAmbulanceStatus
);

export default router;
