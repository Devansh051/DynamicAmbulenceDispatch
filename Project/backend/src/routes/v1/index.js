import { Router } from 'express';
import healthRoutes from '../../modules/health/health.routes.js';
import authRoutes from '../../modules/auth/auth.routes.js';
import userRoutes from '../../modules/users/user.routes.js';
import ambulanceRoutes from '../../modules/ambulances/ambulance.routes.js';
import hospitalRoutes from '../../modules/hospitals/hospital.routes.js';
import emergencyRoutes from '../../modules/emergencies/emergency.routes.js';
import zoneRoutes from '../../modules/zones/zone.routes.js';
import dispatchRoutes from '../../modules/dispatch/dispatch.routes.js';
import fleetRoutes from '../../modules/fleet/fleet.routes.js';
import { formatSuccess } from '../../utils/responseFormatter.js';
import Hospital from '../../modules/hospitals/hospital.model.js';
import Ambulance from '../../modules/ambulances/ambulance.model.js';
import Emergency from '../../modules/emergencies/emergency.model.js';
import ServiceZone from '../../modules/zones/zone.model.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';
import { USER_ROLES } from '../../modules/users/user.model.js';
import {
  triggerManualSync,
  getSyncStatus,
  getSyncHistory
} from '../../modules/hospitals/hospital.controller.js';

const router = Router();

// Mount health routes
router.use('/health', healthRoutes);

// Mount Phase 2 authentication and user management routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// Mount Phase 3 core data management routes
router.use('/ambulances', ambulanceRoutes);
router.use('/hospitals', hospitalRoutes);
router.use('/emergencies', emergencyRoutes);
router.use('/zones', zoneRoutes);

// Mount Phase 5 dispatch engine & fleet response routes
router.use('/dispatch', dispatchRoutes);
router.use('/fleet', fleetRoutes);

// Phase 4: Admin Hospital Directory Synchronization routes
const adminHospitalRouter = Router();
adminHospitalRouter.post('/sync', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), triggerManualSync);
adminHospitalRouter.get('/sync/status', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), getSyncStatus);
adminHospitalRouter.get('/sync/history', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN), getSyncHistory);

router.use('/admin/hospitals', adminHospitalRouter);

// Read-only overview endpoint for EMS dashboard summary
router.get('/overview', authenticate, requireActiveAccount, authorize(USER_ROLES.ADMIN, USER_ROLES.DISPATCHER), async (req, res, next) => {
  try {
    const [hospitals, ambulances, emergenciesCount, zonesCount] = await Promise.all([
      Hospital.findAll({
        attributes: ['HospitalID', 'HospitalName', 'Location', 'city', 'state', 'facility_type', 'is_active'],
        order: [['HospitalID', 'ASC']]
      }),
      Ambulance.findAll({
        attributes: ['AmbulanceID', 'fleet_code', 'CurrentHospitalID', 'Status', 'Fuel', 'vehicle_type', 'is_active'],
        order: [['AmbulanceID', 'ASC']]
      }),
      Emergency.count(),
      ServiceZone.count({ where: { is_active: true } })
    ]);

    const availableAmbulances = ambulances.filter(a => a.Status?.toLowerCase() === 'available').length;
    const busyAmbulances = ambulances.filter(a => a.Status?.toLowerCase() === 'busy').length;

    res.json(formatSuccess({
      hospitalsCount: hospitals.length,
      ambulancesCount: ambulances.length,
      emergenciesCount,
      activeZonesCount: zonesCount,
      availableAmbulances,
      busyAmbulances,
      hospitals: hospitals.slice(0, 10),
      recentAmbulances: ambulances.slice(0, 10)
    }));
  } catch (err) {
    next(err);
  }
});

export default router;
