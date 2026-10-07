import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import env from '../src/config/env.js';
import sequelize from '../src/config/database.js';
import Ambulance from '../src/modules/ambulances/ambulance.model.js';

const base = new URL(process.env.DEMO_API_URL || `http://127.0.0.1:${env.port}/api/v1/`);
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let token, socket, simulatorStarted = false, incident;
async function api(path, method = 'GET', body) {
  const response = await fetch(base.href.replace(/\/$/, '') + path, { method, signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${payload.error?.code || response.status}`);
  return payload.data;
}
async function until(check, label, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { if (await check()) return; await pause(500); }
  throw new Error('Timed out: ' + label);
}
function snapshotOnConnect() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Socket snapshot timed out')), 10000);
    socket.once('fleet:snapshot', (snapshot) => { clearTimeout(timeout); resolve(snapshot); });
    socket.connect();
  });
}

try {
  assert(env.nodeEnv !== 'production' && /^[A-Za-z][A-Za-z0-9_]*_Test$/.test(env.db.database), 'Use an isolated _Test database.');
  assert(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname), 'Demo target must be a local HTTP server.');
  assert(process.env.DEMO_ADMIN_PASSWORD, 'Set the password used by demo:setup.');
  token = (await api('/auth/login', 'POST', { email: process.env.DEMO_ADMIN_EMAIL || 'fleet-demo@ems.test', password: process.env.DEMO_ADMIN_PASSWORD })).token;
  const details = await api('/health/details');
  assert(details.database.database === env.db.database && details.environment !== 'production', 'API and demo database must match.');
  const vehicles = await Ambulance.findAll({ where: { fleet_code: ['SIM-DEMO-1', 'SIM-DEMO-2', 'SIM-DEMO-3'], is_simulated: true } });
  assert(vehicles.length === 3, 'Run demo:setup first.');
  const ids = vehicles.map((vehicle) => vehicle.AmbulanceID);
  const [priorHistory] = await sequelize.query('SELECT COUNT(*) AS locations FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids)', { replacements: { ids } });
  const started = await api('/fleet/simulator/start', 'POST', { ambulance_ids: ids, mode: 'patrol', update_interval_ms: 2000, heartbeat_interval_ms: 1000 });
  assert.deepEqual(started.vehicles.map((vehicle) => vehicle.ambulance_id).sort(), [...ids].sort(), 'Use a dedicated demo simulator.');
  simulatorStarted = true;
  const { io } = createRequire(new URL('../../frontend/package.json', import.meta.url))('socket.io-client');
  socket = io(base.origin, { auth: { token }, autoConnect: false, reconnection: false });
  const initial = (await snapshotOnConnect()).fleet.filter((vehicle) => ids.includes(vehicle.ambulance_id));
  assert(initial.length === 3);
  await until(async () => {
    const current = (await api('/fleet/snapshot')).fleet;
    return initial.every((previous) => current.some((vehicle) => vehicle.ambulance_id === previous.ambulance_id &&
      (vehicle.latitude !== previous.latitude || vehicle.longitude !== previous.longitude)));
  }, 'all three vehicles move');
  incident = await api('/emergencies', 'POST', { location_address: 'Synthetic demo incident only', latitude: 12.974, longitude: 77.593,
    emergency_type: 'CARDIAC', severity: 5, is_simulated: true });
  await api('/emergencies/' + incident.id + '/status', 'PATCH', { status: 'VERIFIED' });
  const recommendation = await api('/emergencies/' + incident.id + '/recommendations', 'POST', {});
  const candidate = recommendation.candidates[0];
  assert(ids.includes(candidate?.ambulance_id), 'Recommended vehicle must belong to the isolated demo.');
  assert(candidate?.is_live_gps, 'Dispatch must use accepted live GPS.');
  const ambulanceId = candidate.ambulance_id;
  incident = await api('/emergencies/' + incident.id + '/assign', 'POST', { ambulance_id: ambulanceId,
    hospital_id: vehicles[0].CurrentHospitalID, recommendation_id: recommendation.recommendation_id });
  for (const status of ['EN_ROUTE', 'AT_PATIENT', 'TRANSPORTING', 'AT_HOSPITAL', 'RESOLVED', 'CLOSED']) {
    incident = await api('/emergencies/' + incident.id + '/status', 'PATCH', { status, notes: 'Synthetic dispatcher confirmation.', resolution_notes: 'Synthetic handover complete.' });
    await pause(2200);
  }
  await api('/fleet/simulator/pause', 'POST', {});
  const thresholds = (await api('/fleet/health')).thresholds;
  await until(async () => (await api('/fleet/ambulances/' + ambulanceId)).health === 'LOCATION_STALE', 'stationary heartbeat with stale GPS', thresholds.location_stale_ms + 5000);
  await api('/fleet/simulator/ambulances/' + ambulanceId + '/connectivity', 'POST', { online: false });
  await until(async () => (await api('/fleet/ambulances/' + ambulanceId)).health === 'OFFLINE', 'heartbeat expiry', thresholds.offline_ms + 5000);
  await api('/fleet/simulator/ambulances/' + ambulanceId + '/connectivity', 'POST', { online: true });
  await api('/fleet/simulator/resume', 'POST', {});
  await until(async () => (await api('/fleet/ambulances/' + ambulanceId)).health === 'ONLINE', 'recovery');
  socket.disconnect();
  assert((await snapshotOnConnect()).fleet.some((vehicle) => vehicle.ambulance_id === ambulanceId));
  let history;
  await until(async () => {
    [history] = await sequelize.query('SELECT (SELECT COUNT(*) FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids)) AS locations, (SELECT COUNT(*) FROM dbo.AmbulanceOperationalEvents WHERE assignment_id = :incidentId) AS transitions',
      { replacements: { ids, incidentId: incident.id } });
    return history[0].locations - priorHistory[0].locations >= 3 && history[0].transitions >= 5;
  }, 'SQL history persistence');
  history[0].locations_during_demo = history[0].locations - priorHistory[0].locations;
  const [integrity] = await sequelize.query('SELECT (SELECT COUNT(*) FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids) AND is_simulated <> 1) AS incorrect_simulation_flags, (SELECT COUNT(*) FROM (SELECT event_id FROM dbo.AmbulanceLocationHistory WHERE ambulance_id IN (:ids) GROUP BY event_id HAVING COUNT(*) > 1) AS duplicates) AS duplicate_events', { replacements: { ids } });
  assert.equal(integrity[0].incorrect_simulation_flags, 0);
  assert.equal(integrity[0].duplicate_events, 0);
  Object.assign(history[0], integrity[0]);
  console.log(JSON.stringify({ verified: true, incident_id: incident.id, ambulance_ids: ids, sql_history: history[0],
    checks: ['movement', 'live-GPS recommendation', 'assignment', 'lifecycle', 'stale GPS', 'offline/recovery', 'socket reconnect', 'SQL persistence'], browser_verified: false }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  if (incident && !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(incident.status)) {
    await api('/emergencies/' + incident.id + '/status', 'PATCH', { status: 'CANCELLED', notes: 'Synthetic demo cleanup after verification failure.' }).catch(() => console.error('Cancel the remaining synthetic incident manually.'));
  }
} finally {
  socket?.disconnect();
  if (simulatorStarted) await api('/fleet/simulator/stop', 'POST', {}).catch(() => console.error('Stop the demo simulator manually.'));
  await sequelize.close();
}
