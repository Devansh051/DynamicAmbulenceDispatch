import { jest } from '@jest/globals';
import { FleetStateStore } from '../src/modules/fleet/fleetState.store.js';
import { FleetTrackerService } from '../src/modules/fleet/fleetTracker.service.js';
import FleetPersistenceWorker from '../src/modules/fleet/fleetPersistence.worker.js';
import Ambulance from '../src/modules/ambulances/ambulance.model.js';
import Emergency from '../src/modules/emergencies/emergency.model.js';
import env from '../src/config/env.js';
import { validateTelemetryPayload } from '../src/modules/fleet/telemetry.validation.js';
import { hasValidCoordinates } from '../src/utils/coordinates.js';
import { requiresAdvancedSupport, matchesSimulation } from '../src/modules/dispatch/dispatchEngine.service.js';
import { moveToward } from '../src/modules/fleet/fleetSimulator.service.js';

const principal = { kind: 'device', sourceId: 'test-device', ambulanceId: 7 };
const payload = (offset = 0, extra = {}) => ({ ambulance_id: 7, latitude: 12.97, longitude: 77.59,
  gps_timestamp: new Date(Date.now() + offset).toISOString(), is_simulated: false, ...extra });
let store;
let tracker;
let originalQueueMax;

beforeEach(() => {
  store = new FleetStateStore({ memory: true });
  tracker = new FleetTrackerService({ store });
  originalQueueMax = env.fleet.persistenceQueueMax;
  jest.spyOn(Ambulance, 'findByPk').mockResolvedValue({ AmbulanceID: 7, fleet_code: 'TEST-7', Status: 'available', is_active: true, is_simulated: false });
  jest.spyOn(Ambulance, 'update').mockResolvedValue([1]);
  jest.spyOn(Emergency, 'findOne').mockResolvedValue(null);
  jest.spyOn(Emergency, 'findAll').mockResolvedValue([]);
});
afterEach(() => { env.fleet.persistenceQueueMax = originalQueueMax; jest.restoreAllMocks(); });

test.each([null, undefined, '', true, false])('rejects absent/non-numeric coordinates: %p', (value) => {
  expect(hasValidCoordinates(value, 0)).toBe(false);
});

test('accepts the equator and prime meridian', () => expect(hasValidCoordinates(0, 0)).toBe(true));
test('rejects string speed and simulation flags', () => {
  expect(() => validateTelemetryPayload(payload(0, { speed_kph: '10' }))).toThrow();
  expect(() => validateTelemetryPayload(payload(0, { is_simulated: 'false' }))).toThrow();
});
test('rejects old, ambiguous, and future timestamps', () => {
  expect(() => validateTelemetryPayload(payload(-600000))).toThrow('too old');
  expect(() => validateTelemetryPayload(payload(600000))).toThrow('future');
  expect(() => validateTelemetryPayload(payload(0, { gps_timestamp: '2026-10-03' }))).toThrow('ISO');
});
test('critical clinical requirements and simulation separation are hard constraints', () => {
  expect(requiresAdvancedSupport({ severity: 5, emergency_type: 'OTHER' })).toBe(true);
  expect(requiresAdvancedSupport({ severity: 2, emergency_type: 'CARDIAC' })).toBe(true);
  expect(matchesSimulation({ is_simulated: true }, {})).toBe(false);
});
test('device credentials cannot report another vehicle', async () => {
  await expect(tracker.ingest(payload(), { ...principal, ambulanceId: 8 })).rejects.toMatchObject({ status: 403 });
});
test('pending accounts cannot report telemetry', async () => {
  await expect(tracker.ingest(payload(), { kind: 'user', user: { role: 'DISPATCHER', status: 'PENDING' } })).rejects.toMatchObject({ status: 403 });
});
test('GPS acceptance is atomic with sampling; no per-point SQL checkpoint', async () => {
  const first = await tracker.ingest(payload(-2000), principal);
  const next = await tracker.ingest(payload(-1000), principal);
  expect(first.sampled_for_history).toBe(true);
  expect(next.sampled_for_history).toBe(false);
  expect(store.memoryQueue).toHaveLength(1);
  expect(Ambulance.update).not.toHaveBeenCalled();
});
test('duplicate/out-of-order GPS does not refresh heartbeat or replace location', async () => {
  const packet = payload(-1000);
  await tracker.ingest(packet, principal);
  const before = await store.get(7);
  const result = await tracker.ingest(packet, principal);
  expect(result.accepted).toBe(false);
  expect((await store.get(7)).last_heartbeat_at).toBe(before.last_heartbeat_at);
});
test('queue saturation rejects before mutating live state', async () => {
  env.fleet.persistenceQueueMax = 1;
  store.memoryQueue.push('{}');
  await expect(tracker.ingest(payload(), principal)).rejects.toMatchObject({ status: 503, code: 'FLEET_QUEUE_FULL' });
  expect(await store.get(7)).toBeNull();
});
test('default store fails closed without Redis', async () => {
  await expect(new FleetStateStore().update({})).rejects.toMatchObject({ status: 503 });
});
test('dispatch state sync never creates a device heartbeat', async () => {
  await tracker.syncOperationalState({ ambulanceId: 7, operationalStatus: 'ASSIGNED', assignmentId: 21, operationVersion: 1, eventId: 'dispatch-1' });
  expect((await store.get(7)).last_heartbeat_at).toBeUndefined();
  await expect(tracker.ingest(payload(0, { operational_status: 'AVAILABLE' }), principal)).rejects.toMatchObject({ code: 'OPERATIONAL_STATE_CONFLICT' });
});
test('implausible jumps are rejected', async () => {
  await tracker.ingest(payload(-1000), principal);
  await expect(tracker.ingest(payload(0, { latitude: 20 }), principal)).rejects.toMatchObject({ code: 'IMPOSSIBLE_MOVEMENT' });
});
test('stationary heartbeat updates health without enqueueing GPS', async () => {
  await tracker.ingest(payload(-1000), principal);
  const before = (await store.get(7)).last_gps_at;
  await tracker.heartbeat({ ambulance_id: 7, is_simulated: false }, principal);
  expect((await store.get(7)).last_gps_at).toBe(before);
  expect(store.memoryQueue).toHaveLength(1);
});
test('partial snapshots retain registered vehicles without claiming live GPS', async () => {
  await tracker.ingest(payload(), principal);
  jest.spyOn(Ambulance, 'findAll').mockResolvedValue([{ AmbulanceID: 7, is_active: true }, { AmbulanceID: 8, is_active: true, current_location_lat: null, current_location_lng: null }]);
  const snapshot = await tracker.getSnapshot();
  expect(snapshot).toHaveLength(2);
  expect(snapshot.find((vehicle) => vehicle.ambulance_id === 8)).toMatchObject({ restored_from_database: true, health: 'OFFLINE', latitude: null });
});
test('SQL snapshot recovery retains incident status without inventing live GPS', async () => {
  jest.spyOn(Ambulance, 'findAll').mockResolvedValue([{ AmbulanceID: 7, is_active: true, Status: 'busy', current_location_lat: 12.97, current_location_lng: 77.59 }]);
  Emergency.findAll.mockResolvedValue([{ id: 21, assigned_ambulance_id: 7, status: 'TRANSPORTING' }]);
  const [state] = await tracker.getSnapshot();
  expect(state).toMatchObject({ assignment_id: 21, operational_status: 'TRANSPORTING', restored_from_database: true, health: 'OFFLINE', last_gps_at: null });
});

test('worker retains failed batches and retries idempotently', async () => {
  await tracker.ingest(payload(), principal);
  const worker = new FleetPersistenceWorker({ store });
  const persist = jest.spyOn(worker, 'persistBatch').mockRejectedValueOnce(new Error('SQL unavailable')).mockResolvedValue(undefined);
  expect(await worker.drainOnce()).toBe(0);
  expect(store.memoryProcessing).toHaveLength(1);
  worker.nextAttemptAt = 0;
  expect(await worker.drainOnce()).toBe(1);
  expect(store.memoryProcessing).toHaveLength(0);
  expect(persist).toHaveBeenCalledTimes(2);
});
test('worker batches already sampled events in one SQL request', async () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  const database = { transaction: jest.fn().mockResolvedValue(transaction), query: jest.fn() };
  const worker = new FleetPersistenceWorker({ store, database });
  await worker.persistBatch([{ event_id: '1', has_location: true }, { event_id: '2', has_location: true }]);
  expect(database.query).toHaveBeenCalledTimes(1);
  expect(transaction.commit).toHaveBeenCalledTimes(1);
});
test('movement respects configured traveled distance and never overshoots', () => {
  const moved = moveToward({ latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 }, 30);
  expect(moved.moved).toBeCloseTo(30);
  const arrived = moveToward({ latitude: 0, longitude: 0 }, { latitude: 0.001, longitude: 0 }, 1000);
  expect(arrived.latitude).toBe(0.001);
  expect(arrived.arrived).toBe(true);
});


test.each([' ', [], {}, 'NaN'])('rejects coerced coordinates: %p', (value) => expect(hasValidCoordinates(value, 0)).toBe(false));
test.each([1.5, '7garbage', '7', true, 0, -1])('rejects malformed ambulance identity: %p', (id) => {
  expect(() => validateTelemetryPayload({ ...payload(), ambulance_id: id })).toThrow();
  expect(() => validateTelemetryPayload({ ...payload(), ambulance_id: undefined, ambulanceId: id })).toThrow();
});
test('authenticated source cannot be spoofed in the payload', async () => {
  await expect(tracker.ingest(payload(0, { source_id: 'another-device' }), principal)).rejects.toMatchObject({ status: 403, code: 'SOURCE_ID_MISMATCH' });
});
test('candidate evaluation fails closed when live state cannot be read', async () => {
  const { default: engine } = await import('../src/modules/dispatch/dispatchEngine.service.js');
  const { default: liveTracker } = await import('../src/modules/fleet/fleetTracker.service.js');
  jest.spyOn(Ambulance, 'findAll').mockResolvedValue([]);
  jest.spyOn(liveTracker, 'getLiveStates').mockRejectedValue(Object.assign(new Error('Redis unavailable'), { status: 503 }));
  await expect(engine.evaluateCandidates({ id: 22 })).rejects.toMatchObject({ status: 503 });
});
