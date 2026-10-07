import { Router } from 'express';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import { USER_ROLES } from '../users/user.model.js';
import { authenticateTelemetry, authorizeTelemetryUser } from './telemetryAuth.middleware.js';
import {
  getFleetAmbulance,
  getFleetHealth,
  getFleetSnapshot,
  advanceSimulatorLifecycle,
  ingestHeartbeat,
  ingestTelemetry,
  pauseSimulator,
  resumeSimulator,
  startSimulator,
  stopSimulator
} from './fleet.controller.js';

const router = Router();
const monitorRoles = [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER];

router.post('/telemetry', authenticateTelemetry, authorizeTelemetryUser, ingestTelemetry);
router.post('/heartbeat', authenticateTelemetry, authorizeTelemetryUser, ingestHeartbeat);

router.get('/snapshot', authenticate, requireActiveAccount, authorize(...monitorRoles), getFleetSnapshot);
router.get('/health', authenticate, requireActiveAccount, authorize(...monitorRoles), getFleetHealth);
router.get('/ambulances/:id', authenticate, requireActiveAccount, authorize(...monitorRoles), getFleetAmbulance);

router.post('/simulator/start', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), startSimulator);
router.post('/simulator/pause', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), pauseSimulator);
router.post('/simulator/resume', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), resumeSimulator);
router.post('/simulator/stop', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), stopSimulator);
router.post('/simulator/ambulances/:id/advance-lifecycle', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), advanceSimulatorLifecycle);

router.post('/simulator/ambulances/:id/connectivity', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), async (req, res, next) => {
  try {
    const { default: simulator } = await import('./fleetSimulator.service.js');
    res.json({ success: true, data: simulator.setConnectivity(req.params.id, req.body.online) });
  } catch (error) { next(error); }
});

export default router;
