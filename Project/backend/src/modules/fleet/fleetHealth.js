import { isValidCoordinate } from './telemetry.validation.js';

export const FLEET_HEALTH = Object.freeze({
  ONLINE: 'ONLINE',
  LOCATION_STALE: 'LOCATION_STALE',
  OFFLINE: 'OFFLINE',
  LOCATION_UNAVAILABLE: 'LOCATION_UNAVAILABLE'
});

export function classifyFleetHealth(state, { now = Date.now(), locationStaleMs = 45000, offlineMs = 90000 } = {}) {
  const heartbeatAt = new Date(state?.last_heartbeat_at || 0).getTime();
  const locationAt = Math.min(new Date(state?.last_gps_at || 0).getTime(), new Date(state?.last_gps_received_at || state?.last_gps_at || 0).getTime());
  const hasLocation = isValidCoordinate(state?.latitude, state?.longitude);

  if (!heartbeatAt || now - heartbeatAt > offlineMs) return FLEET_HEALTH.OFFLINE;
  if (!hasLocation || !locationAt) return FLEET_HEALTH.LOCATION_UNAVAILABLE;
  if (now - locationAt > locationStaleMs) return FLEET_HEALTH.LOCATION_STALE;
  return FLEET_HEALTH.ONLINE;
}

export function toPublicFleetState(state, options = {}) {
  if (!state) return null;
  const health = classifyFleetHealth(state, options);
  return {
    ambulance_id: Number(state.ambulance_id),
    fleet_code: state.fleet_code || null,
    latitude: state.latitude === null || state.latitude === undefined ? null : Number(state.latitude),
    longitude: state.longitude === null || state.longitude === undefined ? null : Number(state.longitude),
    speed_kph: state.speed_kph === null || state.speed_kph === undefined ? null : Number(state.speed_kph),
    heading_degrees: state.heading_degrees === null || state.heading_degrees === undefined ? null : Number(state.heading_degrees),
    operational_status: state.operational_status || 'AVAILABLE',
    assignment_id: state.assignment_id === null || state.assignment_id === undefined ? null : Number(state.assignment_id),
    last_gps_at: state.last_gps_at || null,
    last_gps_received_at: state.last_gps_received_at || null,
    server_received_at: state.server_received_at || null,
    revision: Number(state.revision || 0),
    epoch: state.epoch || null,
    observed_at: new Date(options.now || Date.now()).toISOString(),
    last_heartbeat_at: state.last_heartbeat_at || null,
    location_stale_ms: options.locationStaleMs ?? 45000,
    offline_ms: options.offlineMs ?? 90000,
    health,
    is_simulated: Boolean(state.is_simulated),
    restored_from_database: Boolean(state.restored_from_database)
  };
}
