import { jest } from '@jest/globals';
import { createServer } from 'http';
import { createRequire } from 'module';
import crypto from 'crypto';
import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import env from '../src/config/env.js';
import Ambulance from '../src/modules/ambulances/ambulance.model.js';
import Emergency from '../src/modules/emergencies/emergency.model.js';
import User from '../src/modules/users/user.model.js';
import Hospital from '../src/modules/hospitals/hospital.model.js';
import sessionService from '../src/modules/auth/session.service.js';
import emergencyService from '../src/modules/emergencies/emergency.service.js';
import store from '../src/modules/fleet/fleetState.store.js';
import tracker from '../src/modules/fleet/fleetTracker.service.js';
import FleetPersistenceWorker from '../src/modules/fleet/fleetPersistence.worker.js';
import { FleetSimulator } from '../src/modules/fleet/fleetSimulator.service.js';
import { attachFleetSocketServer, closeFleetSocketServer } from '../src/modules/fleet/fleet.socket.js';

const { io } = createRequire(new URL('../../frontend/package.json', import.meta.url))('socket.io-client');
const suffix = crypto.randomUUID().slice(0, 8);
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const receive = (socket, event) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for ' + event)), 5000);
  socket.once(event, (payload) => { clearTimeout(timeout); resolve(payload); });
});
let user, token, hospital, simulator, worker, server, socket, vehicles, incident;
let prefix;

beforeAll(async () => {
  env.fleet.redisPrefix = 'ems:test:' + suffix;
  prefix = env.fleet.redisPrefix;
  env.fleet.simulatorEnabled = true;
  env.fleet.simulatorAllowActiveAssignments = true;
  env.fleet.socketBroadcastIntervalMs = 30;
  expect(await store.init()).toBe(true);
  user = await User.create({ email: 'fleet-' + suffix + '@ems.test', name: 'Fleet Test Dispatcher', role: 'ADMIN', status: 'ACTIVE', password_hash: 'test-only-unused', must_change_password: false });
  token = sessionService.createSessionToken(user).token;
  hospital = await Hospital.create({ HospitalName: 'Fleet Test ' + suffix, Location: 'Synthetic test base', latitude: 12.97, longitude: 77.59, is_active: true });
  vehicles = await Promise.all([0, 1, 2].map((index) => Ambulance.create({ fleet_code: 'SIM-' + suffix + '-' + index,
    registration_number: 'SIM-' + suffix + '-' + index, CurrentHospitalID: hospital.HospitalID, Status: 'available',
    Fuel: 100, is_simulated: true, is_active: true, vehicle_type: 'ADVANCED_LIFE_SUPPORT', current_location_lat: 12.97 + index * 0.001, current_location_lng: 77.59 })));
  simulator = new FleetSimulator();
  worker = new FleetPersistenceWorker();
  server = createServer(app);
  attachFleetSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  socket?.disconnect();
  await simulator?.stop();
  await worker?.stop({ drain: true });
  await closeFleetSocketServer();
  if (store.isRedisReady() && prefix?.startsWith('ems:test:')) {
    const keys = [];
    for await (const key of store.client.scanIterator({ MATCH: prefix + ':*' })) keys.push(key);
    if (keys.length) await store.client.unlink(keys);
  }
  await store.close();
  await sequelize.close();
});

test('multiple simulated ambulances ingest into actual Redis and socket snapshots', async () => {
  await simulator.start({ ambulance_ids: vehicles.map((vehicle) => vehicle.AmbulanceID), update_interval_ms: 1000 });
  expect((await store.snapshot()).length).toBe(3);
  socket = io('http://127.0.0.1:' + server.address().port, { autoConnect: false, auth: { token } });
  const snapshot = receive(socket, 'fleet:snapshot');
  socket.connect();
  expect((await snapshot).fleet.filter((vehicle) => vehicles.some((candidate) => candidate.AmbulanceID === vehicle.ambulance_id))).toHaveLength(3);
  const updated = receive(socket, 'fleet:update');
  await wait(30);
  await simulator.tick();
  expect((await updated).is_simulated).toBe(true);
});

test('real HTTP telemetry authorization and bounded Redis queue work', async () => {
  const unauthorized = await request(app).post('/api/v1/fleet/telemetry').send({});
  expect(unauthorized.status).toBe(401);
  const wrongVehicle = await request(app).post('/api/v1/fleet/telemetry').set('Authorization', 'Bearer ' + token).send({
    ambulance_id: vehicles[0].AmbulanceID, latitude: 12.97, longitude: 77.59, gps_timestamp: new Date().toISOString(), is_simulated: false
  });
  expect(wrongVehicle.status).toBe(400);
  const depth = await store.getPersistenceQueueDepth();
  expect(depth.total).toBe(3);
});

test('SQL worker persists sampled points and retries the same event without duplicate rows', async () => {
  const tokens = await store.client.lRange(store.key('persistence'), 0, -1);
  expect(await worker.drainOnce()).toBe(3);
  const [rows] = await sequelize.query('SELECT COUNT(*) AS count FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids)', { replacements: { ids: vehicles.map((vehicle) => vehicle.AmbulanceID) } });
  expect(rows[0].count).toBe(3);
  await store.client.lPush(store.key('persistence'), tokens);
  expect(await worker.drainOnce()).toBe(3);
  const [replayed] = await sequelize.query('SELECT COUNT(*) AS count FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids)', { replacements: { ids: vehicles.map((vehicle) => vehicle.AmbulanceID) } });
  expect(replayed[0].count).toBe(3);
});

test('simulation isolation and concurrent assignment use real database constraints', async () => {
  const operational = await Emergency.create({ location_address: 'Synthetic operational test', severity: 3, emergency_type: 'OTHER', status: 'VERIFIED' });
  const rejected = await request(app).post('/api/v1/emergencies/' + operational.id + '/assign').set('Authorization', 'Bearer ' + token).send({ ambulance_id: vehicles[0].AmbulanceID });
  expect(rejected.status).toBe(409);
  const incidents = await Promise.all([0, 1].map((index) => Emergency.create({ location_address: 'Synthetic simulation ' + suffix + '-' + index,
    latitude: 12.974, longitude: 77.593, severity: 5, emergency_type: 'CARDIAC', status: 'VERIFIED', is_simulated: true })));
  const assigned = await Promise.all(incidents.map((candidate) => request(app).post('/api/v1/emergencies/' + candidate.id + '/assign').set('Authorization', 'Bearer ' + token).send({ ambulance_id: vehicles[0].AmbulanceID })));
  expect(assigned.map((response) => response.status).sort()).toEqual([200, 409]);
  incident = incidents[assigned.findIndex((response) => response.status === 200)];
  await tracker.monitorHealth();
  expect((await store.get(vehicles[0].AmbulanceID)).assignment_id).toBe(incident.id);
});

test('crew cannot read or advance another incident, including history and routes', async () => {
  const crew = await User.create({ email: 'crew-' + suffix + '@ems.test', name: 'Synthetic crew', role: 'AMBULANCE_CREW', status: 'ACTIVE', password_hash: 'test-only-unused' });
  const crewToken = sessionService.createSessionToken(crew).token;
  env.fleet.crewBindings[String(crew.id)] = vehicles[1].AmbulanceID;
  try {
    for (const endpoint of ['', '/history', '/hospitals']) {
      const response = await request(app).get('/api/v1/emergencies/' + incident.id + endpoint).set('Authorization', 'Bearer ' + crewToken);
      expect(response.status).toBe(403);
    }
    const response = await request(app).patch('/api/v1/emergencies/' + incident.id + '/status')
      .set('Authorization', 'Bearer ' + crewToken).send({ status: 'EN_ROUTE' });
    expect(response.status).toBe(403);
    await expect(emergencyService.updateResponseLifecycleStatus(incident.id, { status: 'EN_ROUTE' }, crew)).rejects.toMatchObject({ status: 403 });
    const assignments = await request(app).get('/api/v1/dispatch/active-assignments').set('Authorization', 'Bearer ' + crewToken);
    expect(assignments.status).toBe(200);
    expect(assignments.body.data.assignments).toEqual([]);
    delete env.fleet.crewBindings[String(crew.id)];
    expect((await request(app).get('/api/v1/dispatch/active-assignments').set('Authorization', 'Bearer ' + crewToken)).status).toBe(403);
  } finally { delete env.fleet.crewBindings[String(crew.id)]; }
});

test('full simulated lifecycle is synchronized and transitions are durable', async () => {
  for (const status of ['EN_ROUTE', 'AT_PATIENT', 'TRANSPORTING', 'AT_HOSPITAL', 'RESOLVED', 'CLOSED']) {
    const response = await request(app).patch('/api/v1/emergencies/' + incident.id + '/status').set('Authorization', 'Bearer ' + token)
      .send({ status, hospital_id: hospital.HospitalID, notes: 'Synthetic confirmation', resolution_notes: 'Synthetic handover complete' });
    expect(response.status).toBe(200);
    await tracker.monitorHealth();
    const state = await store.get(vehicles[0].AmbulanceID);
    const target = await simulator.targetFor(simulator.vehicles.get(vehicles[0].AmbulanceID), state);
    if (status === 'EN_ROUTE') expect(Number(target.latitude)).toBe(Number(incident.latitude));
    if (status === 'TRANSPORTING') expect(target.HospitalID).toBe(hospital.HospitalID);
  }
  expect((await store.get(vehicles[0].AmbulanceID)).operational_status).toBe('AVAILABLE');
  const [rows] = await sequelize.query('SELECT COUNT(*) AS count FROM dbo.AmbulanceOperationalEvents WHERE ambulance_id = :id', { replacements: { id: vehicles[0].AmbulanceID } });
  expect(rows[0].count).toBeGreaterThanOrEqual(6);
});

test('independent heartbeat, offline recovery and reconnect snapshot are correct', async () => {
  simulator.pause();
  const id = vehicles[0].AmbulanceID;
  const previous = await store.get(id);
  await simulator.heartbeatTick();
  expect((await store.get(id)).last_gps_at).toBe(previous.last_gps_at);
  const raw = await store.get(id);
  raw.last_heartbeat_at = new Date(Date.now() - env.fleet.offlineMs - 1).toISOString();
  await store.client.set(store.stateKey(id), JSON.stringify(raw));
  expect((await tracker.getLiveStates([id])).get(id).health).toBe('OFFLINE');
  await wait(5);
  await simulator.heartbeatTick();
  expect((await tracker.getLiveStates([id])).get(id).health).toBe('ONLINE');
  socket.disconnect();
  const snapshot = receive(socket, 'fleet:snapshot');
  socket.connect();
  expect((await snapshot).fleet.some((vehicle) => vehicle.ambulance_id === id)).toBe(true);
});

test('expired/revoked sessions cannot reconnect to Socket.IO', async () => {
  const denied = io('http://127.0.0.1:' + server.address().port, { autoConnect: false, auth: { token: 'not-a-token' }, reconnection: false });
  const error = receive(denied, 'connect_error');
  denied.connect();
  expect((await error).message).toContain('denied');
  denied.disconnect();
});


test('device HTTP binding, source identity, pending crew and payload limits fail closed', async () => {
  const device = await Ambulance.create({ fleet_code: 'DEVICE-' + suffix, CurrentHospitalID: hospital.HospitalID,
    Status: 'available', Fuel: 100, is_simulated: false, is_active: true, vehicle_type: 'ADVANCED_LIFE_SUPPORT' });
  env.fleet.telemetryDevices['device-' + suffix] = { key: 'test-only-device-key', ambulance_id: device.AmbulanceID };
  const send = (body) => request(app).post('/api/v1/fleet/telemetry').set('x-source-id', 'device-' + suffix).set('x-telemetry-key', 'test-only-device-key').send(body);
  const packet = { ambulance_id: device.AmbulanceID, latitude: 12.97, longitude: 77.59, is_simulated: false, gps_timestamp: new Date().toISOString(), event_id: 'first' };
  try {
    expect((await send({ ...packet, ambulance_id: vehicles[1].AmbulanceID, is_simulated: true })).status).toBe(403);
    expect((await send({ ...packet, source_id: 'forged' })).status).toBe(403);
    expect((await send(packet)).status).toBe(202);
    expect((await send({ ...packet, gps_timestamp: new Date().toISOString() })).body.data.accepted).toBe(false);
    expect((await send({ ...packet, event_id: 'old', gps_timestamp: new Date(Date.now() - 600000).toISOString() })).status).toBe(400);
    expect((await send({ ...packet, event_id: 'future', gps_timestamp: new Date(Date.now() + 600000).toISOString() })).status).toBe(400);
    expect((await send({ ...packet, padding: 'x'.repeat(env.fleet.telemetryMaxPayloadBytes) })).status).toBe(413);
    const limit = env.fleet.telemetryMaxEventsPerMinute;
    env.fleet.telemetryMaxEventsPerMinute = 1;
    try { expect((await send({ ...packet, event_id: 'limited' })).status).toBe(429); }
    finally { env.fleet.telemetryMaxEventsPerMinute = limit; }
    const pending = await User.create({ email: 'pending-' + suffix + '@ems.test', name: 'Pending synthetic crew', role: 'AMBULANCE_CREW', status: 'PENDING', password_hash: 'test-only-unused' });
    expect((await request(app).post('/api/v1/fleet/telemetry').set('Authorization', 'Bearer ' + sessionService.createSessionToken(pending).token).send(packet)).status).toBe(403);
  } finally { delete env.fleet.telemetryDevices['device-' + suffix]; }
});

test('simultaneous duplicate assignment is durably idempotent and terminal release occurs once', async () => {
  const emergency = await Emergency.create({ location_address: 'Idempotency simulation ' + suffix, severity: 5, emergency_type: 'CARDIAC', status: 'VERIFIED', is_simulated: true });
  const key = 'idempotency-' + suffix;
  const assign = () => request(app).post('/api/v1/emergencies/' + emergency.id + '/assign').set('Authorization', 'Bearer ' + token)
    .set('Idempotency-Key', key).send({ ambulance_id: vehicles[1].AmbulanceID });
  const responses = await Promise.all([assign(), assign()]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  const [events] = await sequelize.query("SELECT COUNT(*) AS count FROM dbo.EmergencyEvents WHERE emergency_id=:id AND event_type='ASSIGNED'", { replacements: { id: emergency.id } });
  expect(events[0].count).toBe(1);
  const current = await Emergency.findByPk(emergency.id);
  const status = (body) => request(app).patch('/api/v1/emergencies/' + emergency.id + '/status').set('Authorization', 'Bearer ' + token).send(body);
  expect((await status({ status: 'RESOLVED', resolution_notes: 'Synthetic completion', version: current.version })).status).toBe(200);
  expect((await status({ status: 'EN_ROUTE', version: current.version })).status).toBe(400);
  expect((await status({ status: 'RESOLVED', resolution_notes: 'Repeated completion' })).status).toBe(200);
  const replacement = await Emergency.create({ location_address: 'New simulation ' + suffix, severity: 3, status: 'VERIFIED', is_simulated: true });
  await emergencyService.assignAmbulance(replacement.id, { ambulance_id: vehicles[1].AmbulanceID }, user);
  expect((await status({ status: 'CLOSED' })).status).toBe(200);
  await expect(emergencyService.recalculateRecommendations(emergency.id, user)).rejects.toMatchObject({ code: 'INVALID_EMERGENCY_STATUS' });
  expect((await Ambulance.findByPk(vehicles[1].AmbulanceID)).Status).toBe('busy');
  await emergencyService.updateResponseLifecycleStatus(replacement.id, { status: 'CANCELLED', notes: 'Synthetic cleanup' }, user);
});

test('reassignment revalidates capability and records the original lifecycle state', async () => {
  const e = await Emergency.create({ location_address: 'Reassignment simulation ' + suffix, severity: 5, emergency_type: 'CARDIAC', status: 'VERIFIED', is_simulated: true });
  await emergencyService.assignAmbulance(e.id, { ambulance_id: vehicles[1].AmbulanceID }, user);
  await emergencyService.updateResponseLifecycleStatus(e.id, { status: 'EN_ROUTE' }, user);
  await vehicles[2].update({ vehicle_type: 'BASIC_LIFE_SUPPORT' });
  await expect(emergencyService.reassignAmbulance(e.id, { new_ambulance_id: vehicles[2].AmbulanceID, reason: 'Test capability' }, user)).rejects.toMatchObject({ status: 409 });
  await vehicles[2].update({ vehicle_type: 'ADVANCED_LIFE_SUPPORT' });
  await emergencyService.reassignAmbulance(e.id, { new_ambulance_id: vehicles[2].AmbulanceID, reason: 'Synthetic breakdown' }, user);
  const [events] = await sequelize.query("SELECT from_status FROM dbo.EmergencyEvents WHERE emergency_id=:id AND event_type='REASSIGNED'", { replacements: { id: e.id } });
  expect(events[0].from_status).toBe('EN_ROUTE');
  expect((await Ambulance.findByPk(vehicles[1].AmbulanceID)).Status).toBe('available');
  await emergencyService.updateResponseLifecycleStatus(e.id, { status: 'CANCELLED', notes: 'Synthetic cleanup' }, user);
});

test('health events, explicit resync, cookie auth and session revocation are enforced', async () => {
  const cookieSocket = io('http://127.0.0.1:' + server.address().port, { autoConnect: false, extraHeaders: { Cookie: env.auth.cookieName + '=' + token }, reconnection: false });
  const snapshot = receive(cookieSocket, 'fleet:snapshot'); cookieSocket.connect(); await snapshot;
  await wait(1100);
  const resynced = receive(cookieSocket, 'fleet:snapshot'); cookieSocket.emit('fleet:resync');
  expect((await resynced).redis_live).toBe(true);
  const id = vehicles[0].AmbulanceID;
  const raw = await store.get(id);
  raw.last_heartbeat_at = new Date(Date.now() - env.fleet.offlineMs - 1).toISOString();
  await store.client.set(store.stateKey(id), JSON.stringify(raw));
  const health = receive(cookieSocket, 'fleet:health'); await tracker.monitorHealth();
  expect((await health).health).toBe('OFFLINE');
  const disconnected = receive(cookieSocket, 'disconnect'); await sessionService.invalidateSessionToken(token);
  tracker.publish({ ...raw, revision: Number(raw.revision) + 1 });
  await disconnected; cookieSocket.disconnect();
});
