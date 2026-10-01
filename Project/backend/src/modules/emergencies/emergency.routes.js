import { Router } from 'express';
import {
  listEmergencies,
  getEmergencyById,
  createEmergency,
  updateEmergency,
  updateEmergencyStatus,
  getDispatchRecommendations,
  requestDispatchOtp,
  assignAndDispatch,
  generateRecommendations,
  recalculateRecommendations,
  getEligibleAmbulances,
  assignAmbulance,
  reassignAmbulance,
  escalateEmergency,
  updateResponseLifecycleStatus,
  getEmergencyEventHistory,
  getEmergencyHospitals
} from './emergency.controller.js';
import {
  validateCreateEmergency,
  validateUpdateEmergency,
  validateUpdateEmergencyStatus
} from './emergency.validation.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import validateRequest from '../../middleware/validateRequest.js';
import { USER_ROLES } from '../users/user.model.js';

const router = Router();

// Core Emergency Operations
router.get(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  listEmergencies
);

router.get(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  getEmergencyById
);

router.post(
  '/',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  validateRequest(validateCreateEmergency),
  createEmergency
);

router.patch(
  '/:id',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  validateRequest(validateUpdateEmergency),
  updateEmergency
);

// Response Status Transitions (Crew can report transitions for their assignments; Dispatcher/Admin oversee)
router.patch(
  '/:id/status',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  updateResponseLifecycleStatus
);

// =========================================================================
// PHASE 5 DISPATCH ENGINE & RESPONSE WORKFLOW ENDPOINTS
// =========================================================================

// Generate multi-factor recommendations
router.post(
  '/:id/recommendations',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  generateRecommendations
);

// Retrieve active recommendation and candidate explanations
router.get(
  '/:id/recommendations',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  getDispatchRecommendations
);

// Recalculate recommendations
router.post(
  '/:id/recalculate',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  recalculateRecommendations
);

// Retrieve eligible and disqualified ambulances
router.get(
  '/:id/eligible-ambulances',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  getEligibleAmbulances
);

// Confirm ambulance assignment (Dispatcher approval + idempotency + override handling)
router.post(
  '/:id/assign',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  assignAmbulance
);

// Reassign ambulance
router.post(
  '/:id/reassign',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  reassignAmbulance
);

// Escalate emergency
router.post(
  '/:id/escalate',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  escalateEmergency
);

// Append-only emergency event timeline history
router.get(
  '/:id/history',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  getEmergencyEventHistory
);

// Candidate receiving hospitals with route ETA and capabilities
router.get(
  '/:id/hospitals',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  getEmergencyHospitals
);

// Phase 4 backwards-compatible endpoints
router.post(
  '/:id/otp',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  requestDispatchOtp
);

router.post(
  '/:id/dispatch',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER),
  assignAndDispatch
);

export default router;

