import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import Hospital from '../src/modules/hospitals/hospital.model.js';
import Ambulance from '../src/modules/ambulances/ambulance.model.js';
import AmbulanceTimeline from '../src/modules/ambulances/ambulanceTimeline.model.js';
import Emergency from '../src/modules/emergencies/emergency.model.js';
import ServiceZone from '../src/modules/zones/zone.model.js';
import sessionService from '../src/modules/auth/session.service.js';
import bcrypt from 'bcrypt';

describe('Phase 3 Core Data Management API Tests', () => {
  let adminUser, dispatcherUser, crewUser, hospitalUser;
  let adminToken, dispatcherToken, crewToken, hospitalToken;

  let createdAmbulanceId;
  let createdHospitalId;
  let createdEmergencyId;
  let createdZoneId;
  beforeAll(async () => {
    // Cleanup any prior test entities to guarantee idempotency
    await ServiceZone.destroy({ where: { zone_code: ['ZONE-SOUTH-EAST', 'ZONE-TEST-FORBID'] } });
    await Emergency.destroy({ where: { location_address: '100 Feet Road, Indiranagar, Bengaluru' } });
    const priorAmbs = await Ambulance.findAll({ where: { fleet_code: 'AMB-TEST-99' } });
    for (const amb of priorAmbs) {
      await AmbulanceTimeline.destroy({ where: { AmbulanceID: amb.AmbulanceID } });
      await amb.destroy();
    }
    await Hospital.destroy({ where: { HospitalName: 'Apex Trauma Center (Koramangala)' } });

    await User.destroy({
      where: {
        email: [
          'p3_admin@ems.local',
          'p3_disp@ems.local',
          'p3_crew@ems.local',
          'p3_hosp@ems.local'
        ]
      }
    });

    const hash = await bcrypt.hash('TestPass123!', 10);

    adminUser = await User.create({
      email: 'p3_admin@ems.local',
      name: 'Phase3 Admin',
      password_hash: hash,
      role: USER_ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    dispatcherUser = await User.create({
      email: 'p3_disp@ems.local',
      name: 'Phase3 Dispatcher',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    crewUser = await User.create({
      email: 'p3_crew@ems.local',
      name: 'Phase3 Crew',
      password_hash: hash,
      role: USER_ROLES.AMBULANCE_CREW,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    hospitalUser = await User.create({
      email: 'p3_hosp@ems.local',
      name: 'Phase3 Hospital',
      password_hash: hash,
      role: USER_ROLES.HOSPITAL_OPERATOR,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    adminToken = sessionService.createSessionToken(adminUser).token;
    dispatcherToken = sessionService.createSessionToken(dispatcherUser).token;
    crewToken = sessionService.createSessionToken(crewUser).token;
    hospitalToken = sessionService.createSessionToken(hospitalUser).token;
  });

  afterAll(async () => {
    // Cleanup test artifacts
    if (createdEmergencyId) {
      await Emergency.destroy({ where: { id: createdEmergencyId } });
    }
    if (createdZoneId) {
      await ServiceZone.destroy({ where: { id: createdZoneId } });
    }
    if (createdAmbulanceId) {
      await AmbulanceTimeline.destroy({ where: { AmbulanceID: createdAmbulanceId } });
      await Ambulance.destroy({ where: { AmbulanceID: createdAmbulanceId } });
    }
    if (createdHospitalId) {
      await Hospital.destroy({ where: { HospitalID: createdHospitalId } });
    }

    await User.destroy({
      where: {
        email: [
          'p3_admin@ems.local',
          'p3_disp@ems.local',
          'p3_crew@ems.local',
          'p3_hosp@ems.local'
        ]
      }
    });

    await sequelize.close();
  });

  // =========================================================================
  // 1. Ambulances Management
  // =========================================================================
  describe('Ambulance Fleet Management', () => {
    it('GET /api/v1/ambulances requires authentication', async () => {
      const res = await request(app).get('/api/v1/ambulances');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/v1/ambulances denies HOSPITAL_OPERATOR role', async () => {
      const res = await request(app)
        .get('/api/v1/ambulances')
        .set('Authorization', `Bearer ${hospitalToken}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/v1/ambulances lists fleet units with pagination and search for DISPATCHER', async () => {
      const res = await request(app)
        .get('/api/v1/ambulances?page=1&limit=5')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
      expect(res.body.meta).toHaveProperty('totalPages');
      expect(res.body.meta).toHaveProperty('total');
    });

    it('POST /api/v1/ambulances forbids DISPATCHER from commissioning ambulances', async () => {
      const res = await request(app)
        .post('/api/v1/ambulances')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          current_hospital_id: 1,
          fleet_code: 'AMB-TEST-DISP',
          fuel_level: 80
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/ambulances creates a new ambulance unit for ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/ambulances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          current_hospital_id: 1,
          fleet_code: 'AMB-TEST-99',
          registration_number: 'KA-01-EMS-9999',
          vehicle_type: 'ADVANCED_LIFE_SUPPORT',
          fuel_level: 95,
          current_location_lat: 12.9716,
          current_location_lng: 77.5946
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('AmbulanceID');
      expect(res.body.data.fleet_code).toBe('AMB-TEST-99');
      expect(res.body.data.Fuel).toBe(95);

      createdAmbulanceId = res.body.data.AmbulanceID;
    });

    it('POST /api/v1/ambulances rejects duplicate fleet codes', async () => {
      const res = await request(app)
        .post('/api/v1/ambulances')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          current_hospital_id: 1,
          fleet_code: 'AMB-TEST-99'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_FLEET_CODE');
    });

    it('PATCH /api/v1/ambulances/:id/status allows DISPATCHER to update status and fuel', async () => {
      const res = await request(app)
        .patch(`/api/v1/ambulances/${createdAmbulanceId}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: 'busy',
          fuel_level: 85,
          message: 'Dispatched to emergency incident'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.Status.toLowerCase()).toBe('busy');
      expect(res.body.data.Fuel).toBe(85);
    });

    it('PATCH /api/v1/ambulances/:id/status rejects invalid status value', async () => {
      const res = await request(app)
        .patch(`/api/v1/ambulances/${createdAmbulanceId}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: 'FLYING_AIRBORNE'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // =========================================================================
  // 2. Hospital Network Management
  // =========================================================================
  describe('Hospital Network Management', () => {
    it('GET /api/v1/hospitals allows all authenticated roles to view directory', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals?limit=5')
        .set('Authorization', `Bearer ${crewToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      // Legacy hospitals preserved
      expect(res.body.data[0]).toHaveProperty('HospitalID');
      expect(res.body.data[0]).toHaveProperty('HospitalName');
    });

    it('GET /api/v1/hospitals/:id returns hospital details with stationed ambulances', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals/1')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.HospitalID).toBe(1);
      expect(res.body.data).toHaveProperty('stationedAmbulances');
      expect(res.body.data).toHaveProperty('average_rating');
    });

    it('POST /api/v1/hospitals creates a new hospital for ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/hospitals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Apex Trauma Center (Koramangala)',
          address: '80 Feet Road, 4th Block, Koramangala',
          city: 'Bengaluru',
          state: 'Karnataka',
          postal_code: '560034',
          facility_type: 'TRAUMA_CENTER',
          ownership: 'PRIVATE',
          phone: '+91-80-25551234',
          latitude: 12.9352,
          longitude: 77.6245
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.HospitalName).toBe('Apex Trauma Center (Koramangala)');
      expect(res.body.data.facility_type).toBe('TRAUMA_CENTER');

      createdHospitalId = res.body.data.HospitalID;
    });

    it('POST /api/v1/hospitals rejects duplicate hospital name', async () => {
      const res = await request(app)
        .post('/api/v1/hospitals')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Apex Trauma Center (Koramangala)'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_HOSPITAL_NAME');
    });

    it('PATCH /api/v1/hospitals/:id/status allows ADMIN to deactivate hospital', async () => {
      const res = await request(app)
        .patch(`/api/v1/hospitals/${createdHospitalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_active).toBe(false);
    });

    it('PATCH /api/v1/hospitals/:id forbids HOSPITAL_OPERATOR modifications', async () => {
      const res = await request(app)
        .patch(`/api/v1/hospitals/${createdHospitalId}`)
        .set('Authorization', `Bearer ${hospitalToken}`)
        .send({ phone: '+91-80-99999999' });

      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 3. Emergency Intake & Management
  // =========================================================================
  describe('Emergency Intake Management', () => {
    it('GET /api/v1/emergencies forbids AMBULANCE_CREW role', async () => {
      const res = await request(app)
        .get('/api/v1/emergencies')
        .set('Authorization', `Bearer ${crewToken}`);

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/emergencies creates an emergency incident for DISPATCHER', async () => {
      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          emergency_type: 'CARDIAC',
          severity: 5,
          location_address: '100 Feet Road, Indiranagar, Bengaluru',
          latitude: 12.9784,
          longitude: 77.6408,
          description: '65yo male experiencing acute chest pain and shortness of breath'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('incident_code');
      expect(res.body.data.incident_code).toMatch(/^EMG-/);
      expect(res.body.data.severity).toBe(5);
      expect(res.body.data.status).toBe('REPORTED');
      // Assignment fields must be null in Phase 3
      expect(res.body.data.assigned_ambulance_id).toBeNull();
      expect(res.body.data.assigned_hospital_id).toBeNull();

      createdEmergencyId = res.body.data.id;
    });

    it('POST /api/v1/emergencies validates severity range (1 to 5)', async () => {
      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          emergency_type: 'TRAUMA',
          severity: 10,
          location_address: 'MG Road'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('GET /api/v1/emergencies/:id retrieves incident details for DISPATCHER', async () => {
      const res = await request(app)
        .get(`/api/v1/emergencies/${createdEmergencyId}`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(createdEmergencyId);
      expect(res.body.data).toHaveProperty('reportedByUser');
      expect(res.body.data.reportedByUser.name).toBe(dispatcherUser.name);
    });

    it('PATCH /api/v1/emergencies/:id/status updates incident status', async () => {
      const res = await request(app)
        .patch(`/api/v1/emergencies/${createdEmergencyId}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: 'VERIFIED',
          resolution_notes: 'Caller identity and location cross-verified with local police beat'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('VERIFIED');
    });
  });

  // =========================================================================
  // 4. Service Zone Management
  // =========================================================================
  describe('Service Zone Management', () => {
    it('GET /api/v1/zones allows DISPATCHER to view active zones', async () => {
      const res = await request(app)
        .get('/api/v1/zones')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('zone_code');
    });

    it('POST /api/v1/zones forbids DISPATCHER from creating service zones', async () => {
      const res = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          zone_code: 'ZONE-TEST-FORBID',
          name: 'Forbidden Test Zone'
        });

      expect(res.status).toBe(403);
    });

    it('POST /api/v1/zones allows ADMIN to create a service zone', async () => {
      const res = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          zone_code: 'ZONE-SOUTH-EAST',
          name: 'South-East Tech Corridor Sector',
          description: 'Covers Bellandur, Sarjapur Road, and Electronic City Phase 1',
          center_latitude: 12.9260,
          center_longitude: 77.6762,
          radius_km: 11.5,
          is_active: true
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.zone_code).toBe('ZONE-SOUTH-EAST');
      expect(Number(res.body.data.radius_km)).toBe(11.5);

      createdZoneId = res.body.data.id;
    });

    it('POST /api/v1/zones rejects duplicate zone code', async () => {
      const res = await request(app)
        .post('/api/v1/zones')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          zone_code: 'ZONE-SOUTH-EAST',
          name: 'Duplicate Zone'
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('DUPLICATE_ZONE_CODE');
    });

    it('PATCH /api/v1/zones/:id/status allows ADMIN to deactivate zone', async () => {
      const res = await request(app)
        .patch(`/api/v1/zones/${createdZoneId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_active).toBe(false);
    });
  });

  // =========================================================================
  // 5. System Overview & Legacy Data Integrity
  // =========================================================================
  describe('System Overview & Legacy Preservation', () => {
    it('GET /api/v1/overview returns updated telemetry with Phase 3 entities', async () => {
      const res = await request(app).get('/api/v1/overview');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hospitalsCount).toBeGreaterThanOrEqual(15);
      expect(res.body.data.ambulancesCount).toBeGreaterThanOrEqual(20);
      expect(res.body.data).toHaveProperty('emergenciesCount');
      expect(res.body.data).toHaveProperty('activeZonesCount');
    });
  });
});
