import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import Hospital, { DATA_SOURCES, VERIFICATION_STATUSES } from '../src/modules/hospitals/hospital.model.js';
import HospitalSyncHistory, { SYNC_STATUS, SYNC_TRIGGERS } from '../src/modules/hospitals/hospitalSyncHistory.model.js';
import Ambulance from '../src/modules/ambulances/ambulance.model.js';
import sessionService from '../src/modules/auth/session.service.js';
import dataGovService from '../src/modules/hospitals/dataGov.service.js';
import googleMapsService from '../src/modules/hospitals/googleMaps.service.js';
import hospitalSyncService from '../src/modules/hospitals/hospitalSync.service.js';
import hospitalService from '../src/modules/hospitals/hospital.service.js';
import bcrypt from 'bcrypt';

describe('Phase 4: Hospital Data Integration, Google Maps & Synchronization', () => {
  let adminUser, dispatcherUser;
  let adminToken, dispatcherToken;
  let testHospitalId;
  let testAmbulanceId;

  beforeAll(async () => {
    // Clean up test users
    await User.destroy({
      where: {
        email: ['p4_admin@ems.local', 'p4_disp@ems.local']
      }
    });

    const hash = await bcrypt.hash('TestPass123!', 10);

    adminUser = await User.create({
      email: 'p4_admin@ems.local',
      name: 'Phase4 Admin',
      password_hash: hash,
      role: USER_ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    dispatcherUser = await User.create({
      email: 'p4_disp@ems.local',
      name: 'Phase4 Dispatcher',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    adminToken = sessionService.createSessionToken(adminUser).token;
    dispatcherToken = sessionService.createSessionToken(dispatcherUser).token;

    // Seed test hospital with known GPS coordinates in Bengaluru
    const hospital = await Hospital.create({
      HospitalName: 'Phase 4 Test Trauma Center',
      Location: 'MG Road, Bengaluru',
      address: 'MG Road, Bengaluru',
      city: 'Bengaluru',
      state: 'Karnataka',
      latitude: 12.9750,
      longitude: 77.6050,
      facility_type: 'TRAUMA_CENTER',
      ownership: 'PUBLIC',
      government_id: 'NIN-TEST-9999',
      data_source: DATA_SOURCES.GOV_DIRECTORY,
      verification_status: VERIFICATION_STATUSES.VERIFIED,
      is_active: true
    });
    testHospitalId = hospital.HospitalID;

    // Seed test ambulance with known GPS coordinates
    const ambulance = await Ambulance.create({
      fleet_code: 'AMB-P4-TEST',
      vehicle_type: 'ALS',
      Status: 'Available',
      Fuel: 85,
      CurrentHospitalID: testHospitalId,
      current_location_lat: 12.9716,
      current_location_lng: 77.5946,
      is_active: true
    });
    testAmbulanceId = ambulance.AmbulanceID;
  });

  afterAll(async () => {
    if (testAmbulanceId) {
      await Ambulance.destroy({ where: { AmbulanceID: testAmbulanceId } });
    }
    if (testHospitalId) {
      await Hospital.destroy({ where: { HospitalID: testHospitalId } });
    }
    await Hospital.destroy({ where: { government_id: ['NIN-MOCK-001', 'NIN-MOCK-002'] } });
    await HospitalSyncHistory.destroy({ where: { sync_id: { [sequelize.Sequelize.Op.like]: 'sync-test-%' } } });
    await User.destroy({ where: { email: ['p4_admin@ems.local', 'p4_disp@ems.local'] } });
  });

  describe('1. DataGovService Integration & Normalization', () => {
    it('normalizes government registry records correctly', () => {
      const rawRecord = {
        nin_to_hfr_id: '12345678',
        facility_name: 'City General Health Post',
        facility_address: '1st Cross, Indiranagar',
        district_name: 'Bengaluru Urban',
        state_name: 'Karnataka',
        pincode: '560038',
        latitude: '12.9785',
        longitude: '77.6408',
        contact_number: '080-25252525'
      };

      const normalized = dataGovService.normalizeRecord(rawRecord);
      expect(normalized).toBeDefined();
      expect(normalized.government_id).toBe('12345678');
      expect(normalized.name).toBe('City General Health Post');
      expect(normalized.district).toBe('Bengaluru Urban');
      expect(normalized.latitude).toBe(12.9785);
      expect(normalized.longitude).toBe(77.6408);
      expect(normalized.phone).toBe('080-25252525');
      expect(normalized.postal_code).toBe('560038');
    });

    it('handles missing or invalid coordinates safely without fabricating data', () => {
      const invalidRecord = {
        nin_to_hfr_id: '87654321',
        facility_name: 'Rural Clinic Without Valid GPS',
        latitude: 'invalid_lat',
        longitude: '999.99' // out of bounds
      };

      const normalized = dataGovService.normalizeRecord(invalidRecord);
      expect(normalized.latitude).toBeNull();
      expect(normalized.longitude).toBeNull();
    });

    it('sanitizes error messages to protect data.gov.in API keys from leaking', () => {
      const fakeErrorWithKey = new Error('HTTP 403 request failed on https://api.data.gov.in/resource/?api-key=SECRET_GOV_KEY_12345');
      const sanitized = dataGovService.sanitizeErrorMessage(fakeErrorWithKey);
      expect(sanitized).not.toContain('SECRET_GOV_KEY_12345');
      expect(sanitized).toContain('api-key=REDACTED');
    });
  });

  describe('2. GoogleMapsService & Route Calculation', () => {
    it('calculates travel duration and driving distance with Haversine fallback', () => {
      const origin = { latitude: 12.9716, longitude: 77.5946 };
      const destination = { latitude: 12.9750, longitude: 77.6050 };

      const estimate = googleMapsService.calculateHaversineDistanceAndTime(origin, destination);
      expect(estimate).toBeDefined();
      expect(estimate.distance_km).toBeGreaterThan(0);
      expect(estimate.distance_meters).toBeGreaterThan(0);
      expect(estimate.duration_seconds).toBeGreaterThan(0);
      expect(estimate.duration_minutes).toBeGreaterThan(0);
    });

    it('normalizes Google Places API (New) response structures safely', () => {
      const mockPlace = {
        id: 'places/ChIJ_12345678',
        displayName: { text: 'Apollo Specialty Hospital' },
        formattedAddress: 'Bannerghatta Rd, Bengaluru',
        location: { latitude: 12.8950, longitude: 77.5980 },
        nationalPhoneNumber: '080-26304050'
      };

      const normalized = googleMapsService.normalizePlaceResult(mockPlace);
      expect(normalized).toBeDefined();
      expect(normalized.google_place_id).toBe('places/ChIJ_12345678');
      expect(normalized.name).toBe('Apollo Specialty Hospital');
      expect(normalized.latitude).toBe(12.8950);
      expect(normalized.longitude).toBe(77.5980);
      expect(normalized.data_source).toBe('GOOGLE_PLACES');
    });
  });

  describe('3. Hospital Synchronization & History Tracking', () => {
    it('tracks synchronization status, interval and scheduler readiness', async () => {
      const status = await hospitalSyncService.getSyncStatus();
      expect(status).toBeDefined();
      expect(status).toHaveProperty('is_running');
      expect(status).toHaveProperty('sync_interval_days', 3);
      expect(status).toHaveProperty('next_scheduled_sync');
    });

    it('records sync history correctly in database', async () => {
      const testSyncId = `sync-test-${Date.now()}`;
      await HospitalSyncHistory.create({
        sync_id: testSyncId,
        trigger_type: SYNC_TRIGGERS.MANUAL,
        started_at: new Date(),
        completed_at: new Date(),
        duration_ms: 1250,
        status: SYNC_STATUS.COMPLETED,
        total_fetched: 25,
        records_inserted: 5,
        records_updated: 18,
        records_skipped: 2,
        records_failed: 0
      });

      const historyResult = await hospitalSyncService.getSyncHistory({ page: 1, limit: 10 });
      expect(historyResult.history.length).toBeGreaterThan(0);
      const created = historyResult.history.find(h => h.sync_id === testSyncId);
      expect(created).toBeDefined();
      expect(created.records_inserted).toBe(5);
      expect(created.records_updated).toBe(18);
    });

    it('prevents overlapping synchronization jobs via concurrency locks', async () => {
      hospitalSyncService.isSyncing = true;
      try {
        const attempt = await hospitalSyncService.performSync();
        expect(attempt.success).toBe(false);
        expect(attempt.message).toContain('already in progress');
      } finally {
        hospitalSyncService.isSyncing = false;
      }
    });
  });

  describe('4. Nearby Hospital Discovery API Endpoints', () => {
    it('GET /api/v1/hospitals/nearby fails with 401 when not authenticated', async () => {
      const res = await request(app).get('/api/v1/hospitals/nearby?lat=12.9716&lng=77.5946');
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/hospitals/nearby returns 400 when missing required coordinates and ambulance ID', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals/nearby')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('coordinates');
    });

    it('GET /api/v1/hospitals/nearby returns 400 when coordinates are out of valid range', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals/nearby?lat=95.0&lng=77.5946')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Latitude');
    });

    it('GET /api/v1/hospitals/nearby returns discovered hospitals and routing estimates with valid coordinates', async () => {
      const res = await request(app)
        .get('/api/v1/hospitals/nearby?lat=12.9716&lng=77.5946&radius=25000')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('search_center');
      expect(res.body.data).toHaveProperty('hospitals');
      expect(Array.isArray(res.body.data.hospitals)).toBe(true);
      expect(res.body.data.hospitals.length).toBeGreaterThan(0);

      const candidate = res.body.data.hospitals[0];
      expect(candidate).toHaveProperty('HospitalName');
      expect(candidate).toHaveProperty('distance_km');
      expect(candidate).toHaveProperty('duration_minutes');
      expect(candidate).toHaveProperty('data_source');
    });

    it('GET /api/v1/hospitals/nearby resolves coordinates from ambulance_id', async () => {
      const res = await request(app)
        .get(`/api/v1/hospitals/nearby?ambulance_id=${testAmbulanceId}&radius=20000`)
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ambulance).toBeDefined();
      expect(res.body.data.ambulance.fleet_code).toBe('AMB-P4-TEST');
      expect(res.body.data.hospitals.length).toBeGreaterThan(0);
    });

    it('GET /api/hospitals/nearby alias resolves correctly without /v1 prefix', async () => {
      const res = await request(app)
        .get('/api/hospitals/nearby?lat=12.9716&lng=77.5946&radius=10000')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hospitals).toBeDefined();
    });
  });

  describe('5. Admin Hospital Synchronization API Endpoints & RBAC', () => {
    it('POST /api/v1/admin/hospitals/sync returns 403 for non-admin users', async () => {
      const res = await request(app)
        .post('/api/v1/admin/hospitals/sync')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/admin/hospitals/sync/status returns 403 for non-admin users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/hospitals/sync/status')
        .set('Authorization', `Bearer ${dispatcherToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/admin/hospitals/sync/status returns 200 with schedule status for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/hospitals/sync/status')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('is_running');
      expect(res.body.data).toHaveProperty('sync_interval_days');
    });

    it('GET /api/v1/admin/hospitals/sync/history returns 200 with paginated audit logs for ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/hospitals/sync/history?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toHaveProperty('page', 1);
    });

    it('POST /api/admin/hospitals/sync alias is accessible directly without /v1 prefix for ADMIN', async () => {
      // Mock performSync to avoid long external network calls during unit test
      const originalPerformSync = hospitalSyncService.performSync;
      hospitalSyncService.performSync = async () => ({
        success: true,
        syncId: 'sync-mock-123',
        message: 'Mock sync completed'
      });

      try {
        const res = await request(app)
          .post('/api/admin/hospitals/sync')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      } finally {
        hospitalSyncService.performSync = originalPerformSync;
      }
    });
  });
});
