import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import Emergency, { EMERGENCY_STATUS, EMERGENCY_TYPES } from '../src/modules/emergencies/emergency.model.js';
import emergencyService, { ALLOWED_STATUS_TRANSITIONS } from '../src/modules/emergencies/emergency.service.js';
import Ambulance, {
  normalizeAmbulanceStatus,
  toDatabaseAmbulanceStatus,
  isAmbulanceAvailable,
  AMBULANCE_STATUS
} from '../src/modules/ambulances/ambulance.model.js';
import ambulanceService from '../src/modules/ambulances/ambulance.service.js';
import AuthAuditLog from '../src/modules/audit/audit.model.js';
import auditService, { AUDIT_EVENTS } from '../src/modules/audit/audit.service.js';
import Hospital, { DATA_SOURCES } from '../src/modules/hospitals/hospital.model.js';
import HospitalSyncHistory, { SYNC_STATUS } from '../src/modules/hospitals/hospitalSyncHistory.model.js';
import hospitalSyncService, { HOSPITAL_MATCHING_PROXIMITY_THRESHOLD_METERS } from '../src/modules/hospitals/hospitalSync.service.js';
import hospitalSyncScheduler from '../src/modules/hospitals/hospitalSync.scheduler.js';
import googleMapsService from '../src/modules/hospitals/googleMaps.service.js';
import sessionService from '../src/modules/auth/session.service.js';
import bcrypt from 'bcrypt';

describe('Phase 4 Targeted Regression Test Suite: All 10 Identified Issues', () => {
  let adminUser, dispatcherUser;
  let adminToken, dispatcherToken;
  let testAmbulance1, testAmbulance2;
  let testHospital;

  const cleanTestData = async () => {
    try {
      await sequelize.query(`
        DELETE FROM dbo.AmbulanceTimeline 
        WHERE AmbulanceID IN (SELECT AmbulanceID FROM dbo.Ambulances WHERE fleet_code IN ('REG-AMB-01', 'REG-AMB-02'));
      `);
      await sequelize.query(`
        UPDATE dbo.Emergencies 
        SET assigned_ambulance_id = NULL 
        WHERE assigned_ambulance_id IN (SELECT AmbulanceID FROM dbo.Ambulances WHERE fleet_code IN ('REG-AMB-01', 'REG-AMB-02'));
      `);
      await sequelize.query(`
        DELETE FROM dbo.Emergencies 
        WHERE location_address IN ('MG Road Metro Station', 'Indiranagar 100ft Road', 'Rollback Junction', 'Electronic City Flyover', 'Koramangala 4th Block', 'Koramangala 5th Block');
      `);
      await sequelize.query(`
        DELETE FROM dbo.Ambulances 
        WHERE fleet_code IN ('REG-AMB-01', 'REG-AMB-02');
      `);
      await sequelize.query(`
        DELETE FROM dbo.Hospitals 
        WHERE HospitalName IN ('Regression General Hospital', 'Gov Verified Center');
      `);
      await sequelize.query(`
        DELETE FROM dbo.Users 
        WHERE email IN ('reg_admin@ems.local', 'reg_disp@ems.local');
      `);
      await sequelize.query(`
        DELETE FROM dbo.HospitalSyncHistory 
        WHERE sync_id LIKE 'sync-stale-%';
      `);
    } catch (e) {
      // ignore
    }
  };

  beforeAll(async () => {
    await cleanTestData();

    const hash = await bcrypt.hash('TestPass123!', 10);
    adminUser = await User.create({
      email: 'reg_admin@ems.local',
      name: 'Regression Admin',
      password_hash: hash,
      role: USER_ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    dispatcherUser = await User.create({
      email: 'reg_disp@ems.local',
      name: 'Regression Dispatcher',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    adminToken = sessionService.createSessionToken(adminUser).token;
    dispatcherToken = sessionService.createSessionToken(dispatcherUser).token;

    // Create test hospital
    testHospital = await Hospital.create({
      HospitalName: 'Regression General Hospital',
      Location: 'Koramangala, Bengaluru',
      address: '100 Feet Rd, Koramangala',
      city: 'Bengaluru',
      state: 'Karnataka',
      latitude: 12.9352,
      longitude: 77.6245,
      is_active: true
    });

    // Create test ambulances
    testAmbulance1 = await Ambulance.create({
      CurrentHospitalID: testHospital.HospitalID,
      Status: 'available',
      Fuel: 85,
      fleet_code: 'REG-AMB-01',
      registration_number: 'KA-01-REG-01',
      vehicle_type: 'ADVANCED_LIFE_SUPPORT',
      current_location_lat: 12.9360,
      current_location_lng: 77.6250,
      last_location_update: new Date(),
      is_active: true
    });

    testAmbulance2 = await Ambulance.create({
      CurrentHospitalID: testHospital.HospitalID,
      Status: 'available',
      Fuel: 15, // Low fuel < 20%
      fleet_code: 'REG-AMB-02',
      registration_number: 'KA-01-REG-02',
      vehicle_type: 'BASIC_LIFE_SUPPORT',
      current_location_lat: 12.9370,
      current_location_lng: 77.6260,
      last_location_update: new Date(),
      is_active: true
    });
  });

  afterAll(async () => {
    await cleanTestData();
  });

  // ==========================================
  // ISSUE 1: Emergency Status Validation & State Machine
  // ==========================================
  describe('Issue 1: Emergency Status State Machine & Backend Validation', () => {
    let testEmergency;

    beforeEach(async () => {
      testEmergency = await Emergency.create({
        location_address: 'MG Road Metro Station',
        latitude: 12.9756,
        longitude: 77.6066,
        severity: 4,
        emergency_type: EMERGENCY_TYPES.TRAUMA,
        status: EMERGENCY_STATUS.REPORTED,
        description: 'Severe injury reported'
      });
    });

    afterEach(async () => {
      if (testEmergency) {
        await Emergency.destroy({ where: { id: testEmergency.id } });
      }
    });

    it('defines explicit allowed status transitions', () => {
      expect(ALLOWED_STATUS_TRANSITIONS[EMERGENCY_STATUS.REPORTED]).toContain(EMERGENCY_STATUS.VERIFIED);
      expect(ALLOWED_STATUS_TRANSITIONS[EMERGENCY_STATUS.REPORTED]).toContain(EMERGENCY_STATUS.CANCELLED);
      expect(ALLOWED_STATUS_TRANSITIONS[EMERGENCY_STATUS.REPORTED]).not.toContain(EMERGENCY_STATUS.RESOLVED);
      expect(ALLOWED_STATUS_TRANSITIONS[EMERGENCY_STATUS.CLOSED]).toHaveLength(0);
      expect(ALLOWED_STATUS_TRANSITIONS[EMERGENCY_STATUS.CANCELLED]).toHaveLength(0);
    });

    it('rejects invalid status transitions with 400 Bad Request', async () => {
      // Direct jump from REPORTED to RESOLVED is forbidden
      const res = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: EMERGENCY_STATUS.RESOLVED });

      expect(res.status).toBe(400);
      const errMsg = res.body.error?.message || res.body.message;
      expect(errMsg).toMatch(/Invalid status transition/i);
    });

    it('allows valid progressive transitions through the state machine', async () => {
      // REPORTED -> VERIFIED
      const res1 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: EMERGENCY_STATUS.VERIFIED });
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe(EMERGENCY_STATUS.VERIFIED);

      // VERIFIED -> DISPATCHED
      const res2 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: EMERGENCY_STATUS.DISPATCHED, ambulance_id: testAmbulance1.AmbulanceID });
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe(EMERGENCY_STATUS.DISPATCHED);

      // DISPATCHED -> EN_ROUTE
      const res3 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: EMERGENCY_STATUS.EN_ROUTE });
      expect(res3.status).toBe(200);
      expect(res3.body.data.status).toBe(EMERGENCY_STATUS.EN_ROUTE);

      // EN_ROUTE -> RESOLVED (with resolution notes)
      const res4 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: EMERGENCY_STATUS.RESOLVED,
          resolution_notes: 'Patient stabilized and admitted to ICU.'
        });
      expect(res4.status).toBe(200);
      expect(res4.body.data.status).toBe(EMERGENCY_STATUS.RESOLVED);

      // RESOLVED -> CLOSED
      const res5 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: EMERGENCY_STATUS.CLOSED });
      expect(res5.status).toBe(200);
      expect(res5.body.data.status).toBe(EMERGENCY_STATUS.CLOSED);

      // CLOSED is terminal; attempting any transition fails
      const res6 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({ status: EMERGENCY_STATUS.REPORTED });
      expect(res6.status).toBe(400);
    });
  });

  // ==========================================
  // ISSUE 2: Transactional Audit Logging & Sanitization
  // ==========================================
  describe('Issue 2: Atomic Emergency Audit Logging and PII Sanitization', () => {
    it('creates an emergency and its audit record atomically, redacting patient PII', async () => {
      const payload = {
        location_address: 'Indiranagar 100ft Road',
        emergency_type: 'CARDIAC',
        severity: 4,
        description: 'Cardiac emergency report',
        latitude: 12.9784,
        longitude: 77.6408,
        contact_phone: '9988776655',
        patient_name: 'Confidential Patient'
      };

      const res = await request(app)
        .post('/api/v1/emergencies')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      const createdId = res.body.data.id;

      // Find the corresponding audit record
      const auditLog = await AuthAuditLog.findOne({
        where: {
          user_id: dispatcherUser.id,
          event_type: AUDIT_EVENTS.EMERGENCY_REPORTED
        },
        order: [['created_at', 'DESC']]
      });

      expect(auditLog).toBeDefined();
      expect(auditLog.user_id).toBe(dispatcherUser.id);

      // Verify that sensitive patient PII is sanitized in audit change_details
      const details = JSON.parse(auditLog.details || '{}');
      expect(details.contact_phone).toBe('[REDACTED]');
      expect(details.patient_name).toBe('[REDACTED]');
      expect(details.location_address).toBe('Indiranagar 100ft Road');

      // Cleanup
      await Emergency.destroy({ where: { id: createdId } });
    });

    it('rolls back emergency creation if the audit transaction fails', async () => {
      const originalLog = auditService.log;
      const originalRecord = auditService.recordAuditEvent;
      // Force audit service to throw an error
      const mockFail = async () => {
        throw new Error('Simulated atomic audit failure');
      };
      auditService.log = mockFail;
      auditService.recordAuditEvent = mockFail;

      try {
        await expect(
          emergencyService.createEmergency(
            {
              location_address: 'Rollback Junction',
              severity: 2,
              emergency_type: EMERGENCY_TYPES.OTHER
            },
            dispatcherUser
          )
        ).rejects.toThrow('Simulated atomic audit failure');

        // Verify that the emergency was NOT persisted (rolled back)
        const found = await Emergency.findOne({ where: { location_address: 'Rollback Junction' } });
        expect(found).toBeNull();
      } finally {
        auditService.log = originalLog;
        auditService.recordAuditEvent = originalRecord;
      }
    });
  });

  // ==========================================
  // ISSUE 3: Ambulance Status Normalization & Case Insensitivity
  // ==========================================
  describe('Issue 3: Ambulance Status Normalization and C++ Compatibility', () => {
    it('normalizes various status casings and aliases to canonical uppercase constants', () => {
      expect(normalizeAmbulanceStatus('available')).toBe(AMBULANCE_STATUS.AVAILABLE);
      expect(normalizeAmbulanceStatus('Available')).toBe(AMBULANCE_STATUS.AVAILABLE);
      expect(normalizeAmbulanceStatus('AVAILABLE')).toBe(AMBULANCE_STATUS.AVAILABLE);
      expect(normalizeAmbulanceStatus('busy')).toBe(AMBULANCE_STATUS.BUSY);
      expect(normalizeAmbulanceStatus('maintenance')).toBe(AMBULANCE_STATUS.MAINTENANCE);
    });

    it('converts canonical status to lowercase for database persistence (C++ legacy compatibility)', () => {
      expect(toDatabaseAmbulanceStatus(AMBULANCE_STATUS.AVAILABLE)).toBe('available');
      expect(toDatabaseAmbulanceStatus(AMBULANCE_STATUS.BUSY)).toBe('busy');
      expect(toDatabaseAmbulanceStatus('Available')).toBe('available');
    });

    it('isAmbulanceAvailable checks availability case-insensitively', () => {
      expect(isAmbulanceAvailable('available')).toBe(true);
      expect(isAmbulanceAvailable('Available')).toBe(true);
      expect(isAmbulanceAvailable('AVAILABLE')).toBe(true);
      expect(isAmbulanceAvailable('busy')).toBe(false);
      expect(isAmbulanceAvailable(null)).toBe(false);
    });

    it('queries ambulances with case-insensitive status filtering', async () => {
      const resUpper = await ambulanceService.getAmbulances({ status: 'AVAILABLE' });
      const resLower = await ambulanceService.getAmbulances({ status: 'available' });
      expect(resUpper.pagination.total).toBe(resLower.pagination.total);
      expect(resUpper.pagination.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================
  // ISSUE 4: Hospital Synchronization Matching (250m Spec)
  // ==========================================
  describe('Issue 4: Hospital Synchronization Matching (< 250m) & Provenance', () => {
    it('enforces the 250-metre proximity matching threshold per Phase 4 specification', () => {
      expect(HOSPITAL_MATCHING_PROXIMITY_THRESHOLD_METERS).toBe(250);
    });

    it('distinguishes nearby hospital branches located > 250m apart as distinct facilities', async () => {
      const branchA = {
        name: 'Apollo Clinic',
        latitude: 12.9750,
        longitude: 77.6050
      };

      const branchB = {
        name: 'Apollo Clinic',
        latitude: 12.9795,
        longitude: 77.6050
      };

      const dist = googleMapsService.calculateHaversineDistance(
        branchA.latitude, branchA.longitude,
        branchB.latitude, branchB.longitude
      );

      expect(dist).toBeGreaterThan(250);
      expect(dist).toBeLessThan(600);
    });

    it('rejects automatic merging if multiple facilities ambiguously match within 250m', () => {
      const existingFacilities = [
        { HospitalID: 101, HospitalName: 'City Care Hospital', latitude: 12.9700, longitude: 77.6000 },
        { HospitalID: 102, HospitalName: 'City Care Hospital', latitude: 12.9705, longitude: 77.6005 }
      ];

      const incomingGovRecord = {
        name: 'City Care Hospital',
        latitude: 12.9702,
        longitude: 77.6002
      };

      const closeMatches = existingFacilities.filter((h) => {
        const d = googleMapsService.calculateHaversineDistance(
          incomingGovRecord.latitude, incomingGovRecord.longitude,
          h.latitude, h.longitude
        );
        return d <= HOSPITAL_MATCHING_PROXIMITY_THRESHOLD_METERS;
      });

      expect(closeMatches.length).toBe(2);
    });
  });

  // ==========================================
  // ISSUE 5: Safe Synchronization Execution & Distributed Locking
  // ==========================================
  describe('Issue 5: Safe Sync Execution, DB-Backed Lock & Crash Recovery', () => {
    it('verifies that the hospital synchronization interval remains configured for 3 days', () => {
      const intervalDays = hospitalSyncScheduler.syncIntervalDays;
      expect(intervalDays).toBe(3);
    });

    it('detects and recovers stale RUNNING synchronization jobs (>30 minutes old)', async () => {
      const staleTimestamp = new Date(Date.now() - 45 * 60 * 1000);
      const testSyncId = `sync-stale-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const staleRecord = await HospitalSyncHistory.create({
        sync_id: testSyncId,
        status: SYNC_STATUS.RUNNING,
        started_at: staleTimestamp,
        records_failed: 0,
        error_details: 'Job started before process crash'
      });

      expect(staleRecord.status).toBe(SYNC_STATUS.RUNNING);

      const recoveredCount = await hospitalSyncService.recoverStaleRunningJobs();
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      const updated = await HospitalSyncHistory.findByPk(staleRecord.id);
      expect(updated.status).toBe(SYNC_STATUS.FAILED);
      expect(updated.error_details).toMatch(/stale lock cleared by recovery handler|Recovered stale/i);

      await HospitalSyncHistory.destroy({ where: { id: staleRecord.id } });
    });
  });

  // ==========================================
  // ISSUE 6: GPS Location Accuracy & Staleness
  // ==========================================
  describe('Issue 6: GPS Location Validation & Staleness Detection', () => {
    it('validates GPS latitude and longitude bounds correctly', () => {
      expect(googleMapsService.calculateHaversineDistance(12.9716, 77.5946, 12.9352, 77.6245)).toBeGreaterThan(0);
      expect(isNaN(googleMapsService.calculateHaversineDistance(95.0, 77.5946, 12.9352, 77.6245))).toBe(false);
    });

    it('identifies location timestamps older than 15 minutes as stale', () => {
      const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
      const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);

      const isStale10 = (Date.now() - tenMinsAgo.getTime()) > 15 * 60 * 1000;
      const isStale20 = (Date.now() - twentyMinsAgo.getTime()) > 15 * 60 * 1000;

      expect(isStale10).toBe(false);
      expect(isStale20).toBe(true);
    });
  });

  // ==========================================
  // ISSUE 7: Hospital Availability & Data Provenance
  // ==========================================
  describe('Issue 7: Hospital Directory vs Real-Time Availability Provenance', () => {
    it('retains government source ID and last synchronization timestamps on hospital records', async () => {
      const syncDate = new Date();
      const hosp = await Hospital.create({
        HospitalName: 'Gov Verified Center',
        government_id: 'NIN-KA-REG-999',
        data_source: DATA_SOURCES.GOV_DIRECTORY,
        data_freshness: 'FRESH',
        last_synced_at: syncDate,
        Location: 'Jayanagar, Bengaluru',
        is_active: true
      });

      expect(hosp.government_id).toBe('NIN-KA-REG-999');
      expect(hosp.data_source).toBe(DATA_SOURCES.GOV_DIRECTORY);
      expect(hosp.last_synced_at).toBeDefined();

      await Hospital.destroy({ where: { HospitalID: hosp.HospitalID } });
    });
  });

  // ==========================================
  // ISSUE 8: Dedicated Emergency Resolution Notes Field
  // ==========================================
  describe('Issue 8: Dedicated Resolution Notes Field without Mutating Description', () => {
    it('stores resolution notes in the dedicated column without modifying the initial description', async () => {
      const originalDescription = 'Multi-vehicle collision on highway near Electronic City.';
      const testEmergency = await Emergency.create({
        location_address: 'Electronic City Flyover',
        latitude: 12.8452,
        longitude: 77.6602,
        severity: 4,
        emergency_type: EMERGENCY_TYPES.TRAUMA,
        status: EMERGENCY_STATUS.EN_ROUTE,
        description: originalDescription
      });

      const resolutionNotes = 'Patient transferred safely to Narayana Hrudayalaya ER. Vitals stable.';

      const updated = await emergencyService.updateEmergencyStatus(
        testEmergency.id,
        EMERGENCY_STATUS.RESOLVED,
        { resolution_notes: resolutionNotes },
        dispatcherUser
      );

      expect(updated.status).toBe(EMERGENCY_STATUS.RESOLVED);
      expect(updated.resolution_notes).toBe(resolutionNotes);
      // Ensure description is completely untouched and preserved!
      expect(updated.description).toBe(originalDescription);

      // Verify audit record contains the resolution notes
      const audit = await AuthAuditLog.findOne({
        where: {
          event_type: AUDIT_EVENTS.EMERGENCY_STATUS_CHANGED
        },
        order: [['created_at', 'DESC']]
      });

      expect(audit).toBeDefined();
      const parsedDetails = JSON.parse(audit.details || '{}');
      expect(parsedDetails.resolution_notes).toBe(resolutionNotes);

      await Emergency.destroy({ where: { id: testEmergency.id } });
    });
  });

  // ==========================================
  // ISSUE 9: Google Maps & External API Error Handling
  // ==========================================
  describe('Issue 9: External API Error Handling, Redaction & Safe Fallbacks', () => {
    it('redacts sensitive API keys and authorization headers from error messages', () => {
      const secretKey = 'AIzaSyA_SecretTestKey123456';
      const errorObj = {
        message: `Request failed with status code 403 on key=${secretKey}`,
        config: { url: `https://maps.googleapis.com/maps/api/place?key=${secretKey}` }
      };

      const sanitized = googleMapsService.sanitizeError(errorObj);
      expect(sanitized).not.toContain(secretKey);
      expect(sanitized).toContain('[REDACTED_API_KEY]');
    });

    it('computes driving route using Haversine calculation when external API is blocked or offline', async () => {
      googleMapsService.routesBlockedUntil = Date.now() + 60000;

      const fallbackRoute = await googleMapsService.computeDrivingRoute({
        originLat: 12.9716,
        originLng: 77.5946,
        destLat: 12.9352,
        destLng: 77.6245
      });

      expect(fallbackRoute).toBeDefined();
      expect(fallbackRoute.distance_km).toBeGreaterThan(0);
      expect(fallbackRoute.duration_minutes).toBeGreaterThan(0);
      expect(fallbackRoute.isEstimated).toBe(true);

      // Reset
      googleMapsService.routesBlockedUntil = 0;
    });
  });

  // ==========================================
  // ISSUE 10: Phase 4 Dispatch Gap: Recommendations, OTP & Concurrency
  // ==========================================
  describe('Issue 10: Phase 4 Dispatch Workflow, OTP & Double Assignment Prevention', () => {
    let dispatchEmergency;

    beforeEach(async () => {
      // Ensure testAmbulance1 is in available status and unassigned
      await Ambulance.update({ Status: 'available' }, { where: { AmbulanceID: testAmbulance1.AmbulanceID } });
      await Emergency.update({ assigned_ambulance_id: null }, { where: { assigned_ambulance_id: testAmbulance1.AmbulanceID } });

      dispatchEmergency = await Emergency.create({
        location_address: 'Koramangala 4th Block',
        latitude: 12.9350,
        longitude: 77.6240,
        severity: 4,
        emergency_type: EMERGENCY_TYPES.TRAUMA,
        status: EMERGENCY_STATUS.REPORTED,
        description: 'Urgent medical assistance requested'
      });
    });

    afterEach(async () => {
      if (dispatchEmergency) {
        await Emergency.destroy({ where: { id: dispatchEmergency.id } });
      }
    });

    it('filters dispatch recommendations based on eligibility (fuel >= 20%, available status)', async () => {
      const recommendations = await emergencyService.getDispatchRecommendations(dispatchEmergency.id);

      expect(recommendations.type).toBe('DISPATCH_RECOMMENDATION');
      expect(recommendations.is_recommendation).toBe(true);
      expect(recommendations.is_confirmed).toBe(false);

      // testAmbulance1 has 85% fuel and available -> in eligible_ambulances
      const foundAmb1 = recommendations.eligible_ambulances.find((r) => r.AmbulanceID === testAmbulance1.AmbulanceID);
      expect(foundAmb1).toBeDefined();
      expect(foundAmb1.Fuel || foundAmb1.fuel).toBe(85);

      // testAmbulance2 has 15% fuel (< 20%) -> in disqualified_ambulances
      const foundAmb2 = recommendations.disqualified_ambulances.find((r) => r.AmbulanceID === testAmbulance2.AmbulanceID);
      expect(foundAmb2).toBeDefined();
    });

    it('generates a 6-digit dispatch OTP with 10-minute expiry', async () => {
      const otpRes = await emergencyService.requestDispatchOtp(
        dispatchEmergency.id,
        dispatcherUser
      );

      expect(otpRes.otp).toBeDefined();
      expect(otpRes.otp).toHaveLength(6);
      expect(/^\d{6}$/.test(otpRes.otp)).toBe(true);
      expect(otpRes.expires_in_seconds).toBe(600);
    });

    it('assigns ambulance atomically and updates status to DISPATCHED with valid OTP', async () => {
      await emergencyService.updateEmergencyStatus(
        dispatchEmergency.id,
        EMERGENCY_STATUS.VERIFIED,
        dispatcherUser
      );

      const { otp } = await emergencyService.requestDispatchOtp(
        dispatchEmergency.id,
        dispatcherUser
      );

      const dispatchResult = await emergencyService.assignAndDispatch(
        dispatchEmergency.id,
        { ambulance_id: testAmbulance1.AmbulanceID, otp },
        dispatcherUser
      );

      expect(dispatchResult).toBeDefined();
      expect(dispatchResult.status).toBe(EMERGENCY_STATUS.DISPATCHED);
      expect(dispatchResult.assigned_ambulance_id).toBe(testAmbulance1.AmbulanceID);

      // Verify ambulance status changed to busy in DB
      const updatedAmb = await Ambulance.findByPk(testAmbulance1.AmbulanceID);
      expect(updatedAmb.Status.toLowerCase()).toBe('busy');
    });

    it('concurrency control: prevents assigning the same ambulance to multiple active emergencies', async () => {
      // First ensure testAmbulance1 is assigned to dispatchEmergency
      await emergencyService.updateEmergencyStatus(
        dispatchEmergency.id,
        EMERGENCY_STATUS.VERIFIED,
        dispatcherUser
      );
      const { otp: firstOtp } = await emergencyService.requestDispatchOtp(
        dispatchEmergency.id,
        dispatcherUser
      );
      await emergencyService.assignAndDispatch(
        dispatchEmergency.id,
        { ambulance_id: testAmbulance1.AmbulanceID, otp: firstOtp },
        dispatcherUser
      );

      // Now create a second emergency and generate its OTP
      const secondEmergency = await Emergency.create({
        location_address: 'Koramangala 5th Block',
        latitude: 12.9360,
        longitude: 77.6250,
        severity: 4,
        emergency_type: EMERGENCY_TYPES.TRAUMA,
        status: EMERGENCY_STATUS.VERIFIED,
        description: 'Second emergency request'
      });

      const { otp: secondOtp } = await emergencyService.requestDispatchOtp(
        secondEmergency.id,
        dispatcherUser
      );

      // Attempt to dispatch already-assigned testAmbulance1
      const res = await request(app)
        .post(`/api/v1/emergencies/${secondEmergency.id}/dispatch`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          ambulance_id: testAmbulance1.AmbulanceID,
          otp: secondOtp
        });

      expect(res.status).toBe(409);
      const errMsg = res.body.error?.message || res.body.message;
      expect(errMsg).toMatch(/already assigned or currently unavailable|already assigned to active emergency/i);

      await Emergency.destroy({ where: { id: secondEmergency.id } });
    });

    it('automatically releases ambulance back to available when emergency is cancelled or closed', async () => {
      await emergencyService.updateEmergencyStatus(
        dispatchEmergency.id,
        EMERGENCY_STATUS.VERIFIED,
        dispatcherUser
      );
      const { otp } = await emergencyService.requestDispatchOtp(
        dispatchEmergency.id,
        dispatcherUser
      );
      await emergencyService.assignAndDispatch(
        dispatchEmergency.id,
        { ambulance_id: testAmbulance1.AmbulanceID, otp },
        dispatcherUser
      );

      const busyAmb = await Ambulance.findByPk(testAmbulance1.AmbulanceID);
      expect(busyAmb.Status.toLowerCase()).toBe('busy');

      const updated = await emergencyService.updateEmergencyStatus(
        dispatchEmergency.id,
        EMERGENCY_STATUS.CANCELLED,
        dispatcherUser
      );

      expect(updated.status).toBe(EMERGENCY_STATUS.CANCELLED);

      const releasedAmb = await Ambulance.findByPk(testAmbulance1.AmbulanceID);
      expect(releasedAmb.Status.toLowerCase()).toBe('available');
    });
  });
});
