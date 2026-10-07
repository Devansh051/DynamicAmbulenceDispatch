import assert from 'node:assert/strict';
import net from 'node:net';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import env from '../src/config/env.js';

assert(/^[A-Za-z][A-Za-z0-9_]*_Test$/.test(env.db.database), 'An isolated _Test database is required.');
assert(env.fleet.redisUrl === 'redis://127.0.0.1:6385', 'Use the dedicated recovery Redis at 127.0.0.1:6385.');
const suffix = crypto.randomUUID().slice(0, 8);
env.fleet.redisPrefix = 'ems:recovery:' + suffix;
env.fleet.simulatorEnabled = true;
env.fleet.persistenceSampleMs = 1;
env.fleet.socketBroadcastIntervalMs = 20;
const target = { host: env.db.host, port: env.db.port };
let sqlOnline = true;
const connections = new Set();
const proxy = net.createServer((client) => {
  if (!sqlOnline) return client.destroy();
  const upstream = net.connect(target);
  for (const socket of [client, upstream]) { connections.add(socket); socket.on('close', () => connections.delete(socket)); socket.on('error', () => { client.destroy(); upstream.destroy(); }); }
  client.pipe(upstream).pipe(client);
});
await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
env.db.host = '127.0.0.1'; env.db.port = proxy.address().port; env.db.instanceName = undefined;
const { default: database } = await import('../src/config/database.js');
const { default: app } = await import('../src/app.js');
const { default: store, FleetStateStore } = await import('../src/modules/fleet/fleetState.store.js');
const { default: tracker } = await import('../src/modules/fleet/fleetTracker.service.js');
const { default: Worker } = await import('../src/modules/fleet/fleetPersistence.worker.js');
const { attachFleetSocketServer, closeFleetSocketServer } = await import('../src/modules/fleet/fleet.socket.js');
const { default: Ambulance } = await import('../src/modules/ambulances/ambulance.model.js');
const { default: Hospital } = await import('../src/modules/hospitals/hospital.model.js');
const { default: User } = await import('../src/modules/users/user.model.js');
const { default: session } = await import('../src/modules/auth/session.service.js');
const { default: engine } = await import('../src/modules/dispatch/dispatchEngine.service.js');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (check, label, timeout = 20000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await check()) return; await wait(100); } throw new Error('Timed out: ' + label); };
const receive = (socket, event) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Socket timeout: ' + event)), 10000); socket.once(event, (value) => { clearTimeout(timer); resolve(value); }); });
const run = promisify(execFile);
const checks = [];
let outageLiveMs = null, queueBeforeRestart = 0;
let socket, server, worker, secondStore;
let sequence = 0;
let vehicle;
const packet = () => ({ ambulance_id: vehicle.AmbulanceID, latitude: 12.97 + (++sequence) * 0.000001, longitude: 77.59,
  gps_timestamp: new Date().toISOString(), event_id: 'recovery-' + sequence, is_simulated: true });
const principal = { kind: 'simulator', sourceId: 'recovery-test' };
try {
  assert(await store.init());
  const hospital = await Hospital.create({ HospitalName: 'Recovery ' + suffix, Location: 'Synthetic recovery base', latitude: 12.97, longitude: 77.59 });
  vehicle = await Ambulance.create({ fleet_code: 'REC-' + suffix, CurrentHospitalID: hospital.HospitalID, Status: 'available', Fuel: 100, is_simulated: true, vehicle_type: 'ADVANCED_LIFE_SUPPORT' });
  const user = await User.create({ email: 'recovery-' + suffix + '@ems.test', name: 'Synthetic recovery', role: 'ADMIN', status: 'ACTIVE', password_hash: 'unused-test-only' });
  server = createServer(app); attachFleetSocketServer(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { io } = createRequire(new URL('../../frontend/package.json', import.meta.url))('socket.io-client');
  socket = io('http://127.0.0.1:' + server.address().port, { autoConnect: false, auth: { token: session.createSessionToken(user).token } });
  const revoked = session.createSessionToken(user).token;
  await session.invalidateSessionToken(revoked);
  const child = await run(process.execPath, ['--input-type=module', '-e', `
    const {default:store}=await import('./src/modules/fleet/fleetState.store.js');
    const {default:session}=await import('./src/modules/auth/session.service.js');
    if (!await store.init()) throw new Error('Redis unavailable');
    const result=await session.verifyActiveSessionToken(process.env.VERIFY_REVOKED_TOKEN);
    await store.close();
    if (result.valid) throw new Error('Revocation lost');
    console.log('REVOCATION_PERSISTED');
  `], {env:{...process.env,FLEET_REDIS_PREFIX:env.fleet.redisPrefix,VERIFY_REVOKED_TOKEN:revoked}});
  assert(child.stdout.includes('REVOCATION_PERSISTED')); checks.push('logout revocation rejected by a fresh Node process');
  const initial = receive(socket, 'fleet:snapshot'); socket.connect(); await initial;
  worker = new Worker();
  await tracker.ingest(packet(), principal); assert.equal(await worker.drainOnce(), 1); checks.push('normal Redis -> worker -> actual SQL');
  await wait(5); await tracker.ingest(packet(), principal);
  sqlOnline = false; for (const connection of connections) connection.destroy();
  await wait(50);
  assert.equal(await worker.drainOnce(), 0);
  assert.equal((await store.getPersistenceQueueDepth()).processing, 1);
  const updated = receive(socket, 'fleet:update');
  const start = performance.now(); await tracker.ingest(packet(), principal); await updated;
  outageLiveMs = performance.now() - start;
  assert(outageLiveMs < 2000); checks.push('actual SQL TCP outage retains claimed batch; live Redis/socket stays responsive');
  sqlOnline = true; worker.nextAttemptAt = 0;
  assert.equal(await worker.drainOnce(), 2); checks.push('SQL TCP restoration drains backlog');

  await wait(5); await tracker.ingest(packet(), principal);
  assert(await store.acquireWorkerLease()); const claimed = await store.popPersistenceBatch(100); assert.equal(claimed.length, 1);
  secondStore = new FleetStateStore(); assert(await secondStore.init());
  assert.equal(await new Worker({ store: secondStore }).drainOnce(), 0);
  assert.equal((await store.getPersistenceQueueDepth()).processing, 1); checks.push('second worker cannot steal a live lease');
  await store.releaseWorkerLease();
  worker = new Worker({ store: secondStore }); assert.equal(await worker.drainOnce(), 1); checks.push('worker restart recovers abandoned pending work');
  await assert.rejects(store.acknowledgePersistenceEvents(claimed), /lease lost/); checks.push('expired worker acknowledgment is rejected');
  await secondStore.client.lPush(secondStore.key('persistence'), claimed.map((event) => event._queue_token));
  assert.equal(await worker.drainOnce(), 1);
  const [duplicates] = await database.query('SELECT event_id FROM dbo.AmbulanceLocationHistory WHERE ambulance_id=:id GROUP BY event_id HAVING COUNT(*)>1', { replacements: { id: vehicle.AmbulanceID } });
  assert.equal(duplicates.length, 0); checks.push('replay does not duplicate SQL history');

  env.fleet.persistenceQueueMax = 1;
  await wait(5); await tracker.ingest(packet(), principal);
  const before = await store.get(vehicle.AmbulanceID);
  await wait(5); await assert.rejects(tracker.ingest(packet(), principal), { code: 'FLEET_QUEUE_FULL' });
  assert.equal((await store.get(vehicle.AmbulanceID)).revision, before.revision); checks.push('queue saturation rejects before mutating live state');
  const duplicate = { ...packet(), event_id: 'same-event' }; // Capacity remains full until worker drains.
  env.fleet.persistenceQueueMax = 10000;
  await worker.stop({ drain: true }); assert.equal((await store.getPersistenceQueueDepth()).total, 0); checks.push('graceful shutdown drains pending batch');
  await wait(5); await tracker.ingest(duplicate, principal);
  await wait(5); assert.equal((await tracker.ingest({ ...duplicate, gps_timestamp: new Date().toISOString() }, principal)).accepted, false);
  assert.equal((await tracker.ingest({ ...packet(), gps_timestamp: new Date(Date.now() - 1000).toISOString() }, principal)).accepted, false);
  checks.push('duplicate IDs and out-of-order GPS rejected in actual Redis');

  const { default: Emergency } = await import('../src/modules/emergencies/emergency.model.js');
  const incident = await Emergency.create({ location_address: 'Recovery dispatch ' + suffix, status: 'VERIFIED', severity: 3, is_simulated: true });
  queueBeforeRestart = (await store.getPersistenceQueueDepth()).total;
  await run('docker', ['stop', '--time', '2', 'ems-phase5-verification']);
  await until(() => !store.isRedisReady(), 'Redis disconnect');
  await assert.rejects(tracker.ingest(packet(), principal), { code: 'FLEET_STATE_UNAVAILABLE' });
  await assert.rejects(engine.revalidateCandidate(vehicle.AmbulanceID, incident.id), { code: 'FLEET_STATE_UNAVAILABLE' });
  checks.push('actual Redis outage rejects telemetry and dispatch');
} catch (error) {
  console.error(error.stack); process.exitCode = 1;
} finally {
  sqlOnline = true;
  // Restart only this verification container, even on a failed assertion.
  await run('docker', ['start', 'ems-phase5-verification']).catch(() => {});
  try {
    await until(() => store.isRedisReady(), 'Redis reconnect');
    if (!process.exitCode) {
      assert.equal((await store.getPersistenceQueueDepth()).total, queueBeforeRestart);
      worker.nextAttemptAt = 0; await worker.drainOnce();
      checks.push('actual Redis AOF restart preserves queue; store reconnects and SQL replay succeeds');
      socket.disconnect(); const resnapshot = receive(socket, 'fleet:snapshot'); socket.connect(); await resnapshot; checks.push('socket reconnect restores authoritative snapshot');
      const [rows] = await database.query('SELECT COUNT(*) AS locations, MIN(CAST(is_simulated AS INT)) AS all_simulated FROM dbo.AmbulanceLocationHistory WHERE ambulance_id=:id', { replacements: { id: vehicle.AmbulanceID } });
      console.log(JSON.stringify({ verified: true, checks, outage_live_socket_ms: outageLiveMs, sql: rows[0], conditions: { simulated_vehicles: 1, redis_port: 6385, sql_outage: 'All application SQL connections interrupted through a local TCP proxy; shared SQL service not stopped', redis_persistence: 'AOF appendfsync always' } }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  socket?.disconnect(); await worker?.stop({ drain: true }).catch(() => {}); await closeFleetSocketServer();
  await secondStore?.close(); await store.close(); await database.close();
  for (const connection of connections) connection.destroy(); await new Promise((resolve) => proxy.close(resolve));
}
