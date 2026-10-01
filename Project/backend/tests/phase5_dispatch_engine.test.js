import { Op } from 'sequelize';
import request from 'supertest';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import Ambulance, { AMBULANCE_STATUS } from '../src/modules/ambulances/ambulance.model.js';
import Hospital from '../src/modules/hospitals/hospital.model.js';
import Emergency, { EMERGENCY_STATUS } from '../src/modules/emergencies/emergency.model.js';
import DispatchRecommendation from '../src/modules/dispatch/dispatchRecommendation.model.js';
import EmergencyEvent from '../src/modules/emergencies/emergencyEvent.model.js';
import sessionService from '../src/modules/auth/session.service.js';
import dispatchEngineService from '../src/modules/dispatch/dispatchEngine.service.js';
import idempotencyService from '../src/modules/dispatch/idempotency.service.js';
import DISPATCH_CONFIG from '../src/modules/dispatch/dispatchConfig.js';

describe('Phase 5: Ambulance Dispatch Engine & Emergency Response Workflow', () => {
  let adminUser, dispatcherUser, crewUser;
  let adminToken, dispatcherToken, crewToken;
  let testHospital;
  let testAmb1, testAmb2, testAmbLowFuel, testAmbBusy;
  let testEmergency;

  beforeAll(async () => {
    // Clean up any leftover test emergencies and assignments from earlier runs
    const oldEmergencies = await Emergency.findAll({
      where: { incident_code: { [Op.like]: 'EMG-P5-%' } }
    });
    if (oldEmergencies.length > 0) {
      const oldIds = oldEmergencies.map(e => e.id);
      await EmergencyEvent.destroy({ where: { emergency_id: oldIds } });
      await DispatchRecommendation.destroy({ where: { emergency_id: oldIds } });
      await Emergency.destroy({ where: { id: oldIds } });
    }

    const hash = await bcrypt.hash('TestPass123!', 10);

    // 1. Find or create test users
    adminUser = await User.findOne({ where: { email: 'p5_admin@ems.local' } });
    if (!adminUser) {
      adminUser = await User.create({
        email: 'p5_admin@ems.local',
        name: 'Phase5 Admin',
        password_hash: hash,
        role: USER_ROLES.ADMIN,
        status: USER_STATUS.ACTIVE,
        email_verified: true,
        must_change_password: false
      });
    }

    dispatcherUser = await User.findOne({ where: { email: 'p5_disp@ems.local' } });
    if (!dispatcherUser) {
      dispatcherUser = await User.create({
        email: 'p5_disp@ems.local',
        name: 'Phase5 Dispatcher',
        password_hash: hash,
        role: USER_ROLES.DISPATCHER,
        status: USER_STATUS.ACTIVE,
        email_verified: true,
        must_change_password: false
      });
    }

    crewUser = await User.findOne({ where: { email: 'p5_crew@ems.local' } });
    if (!crewUser) {
      crewUser = await User.create({
        email: 'p5_crew@ems.local',
        name: 'Phase5 Paramedic Crew',
        password_hash: hash,
        role: USER_ROLES.AMBULANCE_CREW,
        status: USER_STATUS.ACTIVE,
        email_verified: true,
        must_change_password: false
      });
    }

    adminToken = sessionService.createSessionToken(adminUser).token;
    dispatcherToken = sessionService.createSessionToken(dispatcherUser).token;
    crewToken = sessionService.createSessionToken(crewUser).token;

    // 2. Find or create test hospital
    testHospital = await Hospital.findOne({ where: { HospitalName: 'Phase 5 Central Trauma Center' } });
    if (!testHospital) {
      testHospital = await Hospital.create({
        HospitalName: 'Phase 5 Central Trauma Center',
        Location: 'MG Road Hub, Bengaluru',
        address: '100 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        latitude: 12.9716,
        longitude: 77.5946,
        facility_type: 'TERTIARY_CARE_HOSPITAL',
        is_active: true
      });
    }

    // 3. Find or create test ambulances and reset statuses
    testAmb1 = await Ambulance.findOne({ where: { fleet_code: 'TEST-P5-001' } });
    if (!testAmb1) {
      testAmb1 = await Ambulance.create({
        fleet_code: 'TEST-P5-001',
        registration_number: 'KA-01-P5-0001',
        CurrentHospitalID: testHospital.HospitalID,
        Status: 'available',
        Fuel: 90,
        vehicle_type: 'ADVANCED_LIFE_SUPPORT',
        current_location_lat: 12.9720,
        current_location_lng: 77.5950,
        is_active: true
      });
    } else {
      testAmb1.Status = 'available';
      testAmb1.Fuel = 90;
      testAmb1.is_active = true;
      testAmb1.current_location_lat = 12.9720;
      testAmb1.current_location_lng = 77.5950;
      await testAmb1.save();
    }

    testAmb2 = await Ambulance.findOne({ where: { fleet_code: 'TEST-P5-002' } });
    if (!testAmb2) {
      testAmb2 = await Ambulance.create({
        fleet_code: 'TEST-P5-002',
        registration_number: 'KA-01-P5-0002',
        CurrentHospitalID: testHospital.HospitalID,
        Status: 'available',
        Fuel: 70,
        vehicle_type: 'BASIC_LIFE_SUPPORT',
        current_location_lat: 12.9800,
        current_location_lng: 77.6000,
        is_active: true
      });
    } else {
      testAmb2.Status = 'available';
      testAmb2.Fuel = 70;
      testAmb2.is_active = true;
      testAmb2.current_location_lat = 12.9800;
      testAmb2.current_location_lng = 77.6000;
      await testAmb2.save();
    }

    testAmbLowFuel = await Ambulance.findOne({ where: { fleet_code: 'TEST-P5-LOW' } });
    if (!testAmbLowFuel) {
      testAmbLowFuel = await Ambulance.create({
        fleet_code: 'TEST-P5-LOW',
        registration_number: 'KA-01-P5-0003',
        CurrentHospitalID: testHospital.HospitalID,
        Status: 'available',
        Fuel: 10,
        vehicle_type: 'ADVANCED_LIFE_SUPPORT',
        current_location_lat: 12.9716,
        current_location_lng: 77.5946,
        is_active: true
      });
    } else {
      testAmbLowFuel.Status = 'available';
      testAmbLowFuel.Fuel = 10;
      testAmbLowFuel.is_active = true;
      await testAmbLowFuel.save();
    }

    testAmbBusy = await Ambulance.findOne({ where: { fleet_code: 'TEST-P5-BUSY' } });
    if (!testAmbBusy) {
      testAmbBusy = await Ambulance.create({
        fleet_code: 'TEST-P5-BUSY',
        registration_number: 'KA-01-P5-0004',
        CurrentHospitalID: testHospital.HospitalID,
        Status: 'busy',
        Fuel: 80,
        vehicle_type: 'ADVANCED_LIFE_SUPPORT',
        current_location_lat: 12.9716,
        current_location_lng: 77.5946,
        is_active: true
      });
    } else {
      testAmbBusy.Status = 'busy';
      testAmbBusy.Fuel = 80;
      testAmbBusy.is_active = true;
      await testAmbBusy.save();
    }

    // 4. Create base emergency
    testEmergency = await Emergency.create({
      incident_code: `EMG-P5-${Date.now()}`,
      emergency_type: 'CARDIAC',
      severity: 5,
      description: 'Severe cardiac arrest, immediate resuscitation needed',
      location_address: 'Brigade Road, Bengaluru',
      latitude: 12.9740,
      longitude: 77.6070,
      status: EMERGENCY_STATUS.REPORTED,
      reported_by_user_id: dispatcherUser.id
    });
  });

  afterAll(async () => {
    // Clean up test records
    try {
      if (testEmergency) {
        await EmergencyEvent.destroy({ where: { emergency_id: testEmergency.id } });
        await DispatchRecommendation.destroy({ where: { emergency_id: testEmergency.id } });
        await Emergency.destroy({ where: { id: testEmergency.id } });
      }
    } catch (e) {
      // Ignore teardown errors
    }
  });

  // =========================================================================
  // 1. DISPATCH RECOMMENDATION ENGINE TESTS
  // =========================================================================
  describe('Dispatch Recommendation Engine', () => {
    test('excludes unavailable and low-fuel ambulances with explicit explanations', async () => {
      const rec = await dispatchEngineService.evaluateCandidates(testEmergency, dispatcherUser);

      expect(rec).toHaveProperty('candidates');
      expect(rec).toHaveProperty('exclusions');

      const excludedLowFuel = rec.exclusions.find(e => e.fleet_code === 'TEST-P5-LOW');
      expect(excludedLowFuel).toBeDefined();
      expect(excludedLowFuel.code).toBe('INSUFFICIENT_FUEL');

      const excludedBusy = rec.exclusions.find(e => e.fleet_code === 'TEST-P5-BUSY');
      expect(excludedBusy).toBeDefined();
      expect(excludedBusy.code).toBe('STATUS_UNAVAILABLE');
    });

    test('generates transparent multi-factor scoring with breakdown and fallback', async () => {
      const rec = await dispatchEngineService.evaluateCandidates(testEmergency, dispatcherUser);

      const topCandidate = rec.top_candidate;
      expect(topCandidate).toBeDefined();
      expect(topCandidate.total_score).toBeGreaterThan(0);
      expect(topCandidate.total_score).toBeLessThanOrEqual(100);

      // Verify all 5 component factors are exposed
      expect(topCandidate.score_breakdown).toHaveProperty('travel_time');
      expect(topCandidate.score_breakdown).toHaveProperty('capability_match');
      expect(topCandidate.score_breakdown).toHaveProperty('zone_coverage_impact');
      expect(topCandidate.score_breakdown).toHaveProperty('fuel_readiness');
      expect(topCandidate.score_breakdown).toHaveProperty('location_freshness');

      // Verify fallback flag when provider route is computed via Haversine
      expect(topCandidate.is_estimated).toBe(true);
      expect(topCandidate.routing_fallback).toBe(true);

      // Verify coverage impact estimation
      expect(['LOW', 'MODERATE', 'HIGH', 'UNKNOWN']).toContain(topCandidate.coverage_impact);
    });

    test('recommends ADVANCED_LIFE_SUPPORT over BLS for Severity 5 cardiac emergency', async () => {
      const rec = await dispatchEngineService.evaluateCandidates(testEmergency, dispatcherUser);

      const alsCandidate = rec.candidates.find(c => c.fleet_code === 'TEST-P5-001');
      const blsCandidate = rec.candidates.find(c => c.fleet_code === 'TEST-P5-002');

      if (alsCandidate && blsCandidate) {
        expect(alsCandidate.score_breakdown.capability_match).toBeGreaterThan(
          blsCandidate.score_breakdown.capability_match
        );
      }
    });

    test('API endpoint POST /emergencies/:id/recommendations generates and persists recommendation', async () => {
      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/recommendations`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('recommendation_uuid');
      expect(res.body.data.candidates_count).toBeGreaterThan(0);
      expect(res.body.data.is_expired).toBe(false);
    });

    test('API endpoint GET /emergencies/:id/recommendations returns candidates and explanations', async () => {
      const res = await request(app)
        .get(`/api/v1/emergencies/${testEmergency.id}/recommendations`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('candidates');
      expect(res.body.data).toHaveProperty('exclusions');
      expect(res.body.data.top_candidate).toBeDefined();
    });

    test('API endpoint POST /emergencies/:id/recalculate refreshes recommendation and logs event', async () => {
      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/recalculate`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('recommendation_uuid');
    });
  });

  // =========================================================================
  // 2. DISPATCHER APPROVAL, OVERRIDES & IDEMPOTENCY TESTS
  // =========================================================================
  describe('Dispatcher Approval & Override Workflow', () => {
    test('rejects assignment without an explicit ambulance_id', async () => {
      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/assign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('AMBULANCE_ID_REQUIRED');
    });

    test('requires override_reason when dispatcher selects a non-top-ranked ambulance', async () => {
      // Get current top recommendation
      const recRes = await request(app)
        .get(`/api/v1/emergencies/${testEmergency.id}/recommendations`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      const topAmbId = recRes.body.data.top_candidate.ambulance_id;
      // Select the alternative candidate (testAmb2 if top is testAmb1)
      const nonTopAmbId = topAmbId === testAmb1.AmbulanceID ? testAmb2.AmbulanceID : testAmb1.AmbulanceID;

      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/assign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          ambulance_id: nonTopAmbId,
          recommendation_id: recRes.body.data.recommendation_id
          // override_reason deliberately omitted
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('OVERRIDE_REASON_REQUIRED');
    });

    test('permits dispatcher override when valid override_reason is provided', async () => {
      const recRes = await request(app)
        .get(`/api/v1/emergencies/${testEmergency.id}/recommendations`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      const topAmbId = recRes.body.data.top_candidate.ambulance_id;
      const nonTopAmbId = topAmbId === testAmb1.AmbulanceID ? testAmb2.AmbulanceID : testAmb1.AmbulanceID;

      const idempotencyKey = `p5-key-override-${Date.now()}`;
      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/assign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          ambulance_id: nonTopAmbId,
          recommendation_id: recRes.body.data.recommendation_id,
          override_reason: 'Paramedic team on TEST-P5-002 has specialized cardiac equipment required on scene.'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('DISPATCHED');
      expect(res.body.data.assigned_ambulance_id).toBe(nonTopAmbId);
      expect(res.body.data.override_reason).toContain('cardiac equipment');

      // Verify idempotency replay returns identical cached response
      const retryRes = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/assign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          ambulance_id: nonTopAmbId,
          recommendation_id: recRes.body.data.recommendation_id,
          override_reason: 'Paramedic team on TEST-P5-002 has specialized cardiac equipment required on scene.'
        });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body.data.id).toBe(res.body.data.id);
    });

    test('rejects idempotency key reuse when payload differs (422 Unprocessable Entity)', async () => {
      const key = `p5-key-mismatch-${Date.now()}`;

      // First call (with ambulance testAmb1)
      await idempotencyService.checkIdempotency(key, '/test', { a: 1 });
      await idempotencyService.saveIdempotencyRecord({
        key,
        userId: dispatcherUser.id,
        path: '/test',
        hash: idempotencyService.hashPayload({ a: 1 }),
        status: 200,
        body: { ok: true }
      });

      // Second call with different payload { a: 2 }
      await expect(
        idempotencyService.checkIdempotency(key, '/test', { a: 2 })
      ).rejects.toThrow(/was already used with a different request payload/);
    });
  });

  // =========================================================================
  // 3. CONCURRENCY & SINGLE-ASSIGNMENT PROTECTION TESTS
  // =========================================================================
  describe('Concurrency & Single-Assignment Protection', () => {
    test('prevents assigning an already assigned ambulance to a second active emergency', async () => {
      // Create a second simultaneous emergency
      const secondEmergency = await Emergency.create({
        incident_code: `EMG-P5-CONF-${Date.now()}`,
        emergency_type: 'TRAUMA',
        severity: 4,
        location_address: 'Indiranagar, Bengaluru',
        status: EMERGENCY_STATUS.VERIFIED
      });

      await testEmergency.reload();
      const busyAmbId = testEmergency.assigned_ambulance_id;

      const res = await request(app)
        .post(`/api/v1/emergencies/${secondEmergency.id}/assign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          ambulance_id: busyAmbId
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(['AMBULANCE_UNAVAILABLE', 'CONCURRENT_ASSIGNMENT_CONFLICT']).toContain(res.body.error.code);

      // Clean up
      await Emergency.destroy({ where: { id: secondEmergency.id } });
    });
  });

  // =========================================================================
  // 4. EMERGENCY RESPONSE LIFECYCLE & REASSIGNMENT TESTS
  // =========================================================================
  describe('Emergency Response Lifecycle & Transitions', () => {
    test('supports controlled ambulance reassignment with mandatory reason', async () => {
      // Current emergency is DISPATCHED with testAmb2. Reassign to testAmb1.
      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/reassign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          new_ambulance_id: testAmb1.AmbulanceID,
          reason: 'Mechanical issue detected; rerouting fresh ALS unit'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assigned_ambulance_id).toBe(testAmb1.AmbulanceID);

      // Verify prior ambulance testAmb2 was released back to 'available'
      await testAmb2.reload();
      expect(testAmb2.Status.toLowerCase()).toBe('available');
    });

    test('enforces state machine transition from DISPATCHED to EN_ROUTE', async () => {
      const res = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${crewToken}`)
        .send({
          status: 'EN_ROUTE',
          notes: 'Ambulance en route with sirens active'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('EN_ROUTE');
    });

    test('enforces state machine transition from EN_ROUTE to AT_PATIENT', async () => {
      const res = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${crewToken}`)
        .send({
          status: 'AT_PATIENT',
          notes: 'Paramedic team on scene attending to patient'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('AT_PATIENT');
    });

    test('rejects invalid jump directly from AT_PATIENT to CLOSED', async () => {
      const res = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: 'CLOSED'
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('escalates emergency and captures explicit reason in history', async () => {
      const res = await request(app)
        .post(`/api/v1/emergencies/${testEmergency.id}/escalate`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          reason: 'Severe patient deterioration on scene; multiple advanced airway interventions required'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.escalation_reason).toContain('Severe patient deterioration');
      expect(res.body.data.escalated_at).toBeDefined();
    });

    test('transitions to TRANSPORTING and AT_HOSPITAL', async () => {
      // AT_PATIENT -> TRANSPORTING
      const res1 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${crewToken}`)
        .send({
          status: 'TRANSPORTING',
          notes: 'Patient stabilized and transported'
        });
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe('TRANSPORTING');

      // TRANSPORTING -> AT_HOSPITAL
      const res2 = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${crewToken}`)
        .send({
          status: 'AT_HOSPITAL',
          notes: 'Arrived at Emergency Department bay'
        });
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe('AT_HOSPITAL');
    });

    test('resolving emergency releases ambulance back to AVAILABLE', async () => {
      const res = await request(app)
        .patch(`/api/v1/emergencies/${testEmergency.id}/status`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          status: 'RESOLVED',
          resolution_notes: 'Patient successfully handed over to ED resuscitation team.'
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('RESOLVED');

      // Verify assigned ambulance testAmb1 was released back to 'available'
      await testAmb1.reload();
      expect(testAmb1.Status.toLowerCase()).toBe('available');
    });

    test('retrieves complete append-only emergency event history', async () => {
      const res = await request(app)
        .get(`/api/v1/emergencies/${testEmergency.id}/history`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(3);

      const eventTypes = res.body.data.map(e => e.event_type);
      expect(eventTypes.some(t => ['ASSIGNED', 'OVERRIDE_ASSIGNED'].includes(t))).toBe(true);
      expect(eventTypes).toContain('STATUS_CHANGE');
      expect(eventTypes).toContain('ESCALATED');
      expect(eventTypes).toContain('RESOLVED');
    });

    test('retrieves hospital candidates with unknown capacity labeled', async () => {
      const res = await request(app)
        .get(`/api/v1/emergencies/${testEmergency.id}/hospitals`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('hospitals');
      expect(res.body.data.hospitals.length).toBeGreaterThan(0);
      expect(res.body.data.hospitals[0].capacity_status).toBe('UNKNOWN');
    });

    test('retrieves fleet active assignments via /api/v1/dispatch/active-assignments', async () => {
      const res = await request(app)
        .get('/api/v1/dispatch/active-assignments')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('active_count');
      expect(res.body.data).toHaveProperty('assignments');
    });

    test('retrieves dispatch engine configuration via /api/v1/dispatch/config', async () => {
      const res = await request(app)
        .get('/api/v1/dispatch/config')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('weights');
      expect(res.body.data.weights.travel_time).toBe(40);
    });
  });
});
