import { FleetStateStore } from '../src/modules/fleet/fleetState.store.js';
import { classifyFleetHealth, FLEET_HEALTH } from '../src/modules/fleet/fleetHealth.js';
import { validateTelemetryPayload } from '../src/modules/fleet/telemetry.validation.js';

describe('Phase 5 fleet telemetry primitives', () => {
  test('accepts zero-valued coordinates and rejects malformed telemetry', () => {
    const accepted = validateTelemetryPayload({
      ambulance_id: 7,
      latitude: 0,
      longitude: 0,
      speed_kph: 0,
      heading_degrees: 0,
      gps_timestamp: '2026-10-01T00:00:00.000Z',
      is_simulated: false
    }, { now: Date.parse('2026-10-01T00:01:00.000Z') });

    expect(accepted.latitude).toBe(0);
    expect(accepted.longitude).toBe(0);
    expect(() => validateTelemetryPayload({ ambulance_id: 7, latitude: 91, longitude: 0, gps_timestamp: '2026-10-01T00:00:00.000Z' })).toThrow('latitude must be between');
    expect(() => validateTelemetryPayload({ ambulance_id: 7, latitude: 12, gps_timestamp: '2026-10-01T00:00:00.000Z' })).toThrow('latitude must be between');
  });

  test('does not let an out-of-order location replace the latest location', () => {
    const store = new FleetStateStore();
    const first = store.mergeInMemory({
      ambulance_id: 7,
      has_location: true,
      latitude: 12.9716,
      longitude: 77.5946,
      speed_kph: 30,
      heading_degrees: 90,
      last_gps_at: '2026-10-01T00:02:00.000Z',
      last_gps_at_ms: Date.parse('2026-10-01T00:02:00.000Z'),
      operational_status: 'ASSIGNED',
      assignment_id: 21,
      status_at_ms: Date.parse('2026-10-01T00:02:00.000Z'),
      last_heartbeat_at: '2026-10-01T00:02:00.000Z',
      last_heartbeat_at_ms: Date.parse('2026-10-01T00:02:00.000Z'),
      is_simulated: false
    });
    const older = store.mergeInMemory({
      ambulance_id: 7,
      has_location: true,
      latitude: 13,
      longitude: 78,
      speed_kph: 5,
      heading_degrees: 180,
      last_gps_at: '2026-10-01T00:01:00.000Z',
      last_gps_at_ms: Date.parse('2026-10-01T00:01:00.000Z'),
      operational_status: 'ASSIGNED',
      assignment_id: 21,
      status_at_ms: Date.parse('2026-10-01T00:01:00.000Z'),
      last_heartbeat_at: '2026-10-01T00:03:00.000Z',
      last_heartbeat_at_ms: Date.parse('2026-10-01T00:03:00.000Z'),
      is_simulated: false
    });

    expect(first.accepted_location).toBe(true);
    expect(older.accepted_location).toBe(false);
    expect(older.state.latitude).toBe(12.9716);
    expect(older.state.longitude).toBe(77.5946);
  });

  test('keeps a stationary ambulance online when its heartbeat is current', () => {
    const now = Date.parse('2026-10-01T00:01:00.000Z');
    expect(classifyFleetHealth({
      latitude: 12.9716,
      longitude: 77.5946,
      last_gps_at: '2026-10-01T00:00:30.000Z',
      last_heartbeat_at: '2026-10-01T00:00:59.000Z'
    }, { now, locationStaleMs: 45000, offlineMs: 90000 })).toBe(FLEET_HEALTH.ONLINE);
  });

  test('separates stale location from an expired heartbeat', () => {
    const now = Date.parse('2026-10-01T00:03:00.000Z');
    expect(classifyFleetHealth({
      latitude: 12.9716,
      longitude: 77.5946,
      last_gps_at: '2026-10-01T00:00:00.000Z',
      last_heartbeat_at: '2026-10-01T00:02:59.000Z'
    }, { now, locationStaleMs: 45000, offlineMs: 90000 })).toBe(FLEET_HEALTH.LOCATION_STALE);
    expect(classifyFleetHealth({
      latitude: 12.9716,
      longitude: 77.5946,
      last_gps_at: '2026-10-01T00:02:59.000Z',
      last_heartbeat_at: '2026-10-01T00:00:00.000Z'
    }, { now, locationStaleMs: 45000, offlineMs: 90000 })).toBe(FLEET_HEALTH.OFFLINE);
  });
});
