import { Router } from 'express';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import { USER_ROLES } from '../users/user.model.js';
import { getActiveAssignments } from '../emergencies/emergency.controller.js';
import DISPATCH_CONFIG from './dispatchConfig.js';
import { formatSuccess } from '../../utils/responseFormatter.js';

const router = Router();

// Retrieve all active emergency ambulance assignments across the fleet
router.get(
  '/active-assignments',
  authenticate,
  requireActiveAccount,
  authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW),
  getActiveAssignments
);

// Retrieve transparent dispatch scoring configuration & metadata
router.get(
  '/config',
  authenticate,
  requireActiveAccount,
  (req, res) => {
    res.json(formatSuccess({
      weights: DISPATCH_CONFIG.weights,
      thresholds: DISPATCH_CONFIG.thresholds,
      metadata: DISPATCH_CONFIG.metadata
    }));
  }
);

export default router;
