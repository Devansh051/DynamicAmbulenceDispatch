import { Router } from 'express';
import {
  listHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  updateHospitalStatus,
  getNearbyHospitals,
  triggerManualSync,
  getSyncStatus,
  getSyncHistory
} from './hospital.controller.js';
import {
  validateCreateHospital,
  validateUpdateHospital,
  validateUpdateHospitalStatus,
  validateNearbyHospitals
} from './hospital.validation.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import validateRequest from '../../middleware/validateRequest.js';
import { USER_ROLES } from '../users/user.model.js';

const router = Router();

// Directory & Details - Accessible to all operational roles
router.get(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW, USER_ROLES.HOSPITAL_OPERATOR),
  listHospitals
);

// Phase 4: Nearby hospital discovery (GPS + Google Places + Routes)
router.get(
  '/nearby',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW, USER_ROLES.HOSPITAL_OPERATOR),
  validateRequest(validateNearbyHospitals),
  getNearbyHospitals
);

// Phase 4: Hospital Directory 3-day sync controls (Admin only)
router.post(
  '/sync',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  triggerManualSync
);

router.get(
  '/sync/status',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  getSyncStatus
);

router.get(
  '/sync/history',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  getSyncHistory
);

router.get(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW, USER_ROLES.HOSPITAL_OPERATOR),
  getHospitalById
);

// Hospital Management - ADMIN only (Operator write access disabled until facility linkage is modeled in Phase 4)
router.post(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateCreateHospital),
  createHospital
);

router.patch(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateUpdateHospital),
  updateHospital
);

router.patch(
  '/:id/status',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN),
  validateRequest(validateUpdateHospitalStatus),
  updateHospitalStatus
);

export default router;
