export const hasFleetCoordinates = (vehicle) => vehicle?.latitude != null && vehicle?.longitude != null &&
  ['number', 'string'].includes(typeof vehicle.latitude) && ['number', 'string'].includes(typeof vehicle.longitude) &&
  String(vehicle.latitude).trim() !== '' && String(vehicle.longitude).trim() !== '' &&
  Number.isFinite(Number(vehicle.latitude)) && Number.isFinite(Number(vehicle.longitude)) &&
  Math.abs(Number(vehicle.latitude)) <= 90 && Math.abs(Number(vehicle.longitude)) <= 180;

export function mergeFleetState(previous, incoming) {
  if (!incoming || !Number.isSafeInteger(Number(incoming.ambulance_id))) return previous;
  const id = Number(incoming.ambulance_id);
  const existing = previous.find((vehicle) => Number(vehicle.ambulance_id) === id);
  if (existing) {
    if (incoming.restored_from_database && !existing.restored_from_database) return previous;
    if (incoming.epoch === existing.epoch && Number(incoming.revision || 0) < Number(existing.revision || 0)) return previous;
    if (incoming.epoch !== existing.epoch && new Date(incoming.observed_at || 0) < new Date(existing.observed_at || 0)) return previous;
    if (incoming.epoch === existing.epoch && Number(incoming.revision || 0) === Number(existing.revision || 0) &&
        new Date(incoming.observed_at || 0) < new Date(existing.observed_at || 0)) return previous;
  }
  const accepted = { ...existing, ...incoming, received_at_client: Date.now() };
  return (existing ? previous.map((vehicle) => Number(vehicle.ambulance_id) === id ? accepted : vehicle) : [...previous, accepted])
    .sort((left, right) => String(left.fleet_code || left.ambulance_id).localeCompare(String(right.fleet_code || right.ambulance_id)));
}

export function ageFleetState(vehicle, now = Date.now()) {
  if (!vehicle.observed_at || vehicle.received_at_client == null) return vehicle;
  const serverNow = new Date(vehicle.observed_at).getTime() + Math.max(0, now - vehicle.received_at_client);
  const heartbeatAt = new Date(vehicle.last_heartbeat_at || 0).getTime();
  const locationAt = Math.min(new Date(vehicle.last_gps_at || 0).getTime(),
    new Date(vehicle.last_gps_received_at || vehicle.last_gps_at || 0).getTime());
  let health = vehicle.health;
  if (!heartbeatAt || serverNow - heartbeatAt > (vehicle.offline_ms ?? 90000)) health = 'OFFLINE';
  else if (!hasFleetCoordinates(vehicle) || !locationAt) health = 'LOCATION_UNAVAILABLE';
  else if (serverNow - locationAt > (vehicle.location_stale_ms ?? 45000)) health = 'LOCATION_STALE';
  return health === vehicle.health ? vehicle : { ...vehicle, health };
}

export function mergeFleetSnapshot(previous, snapshot, generatedAt) {
  const ids = new Set((snapshot || []).map((vehicle) => Number(vehicle.ambulance_id)));
  const base = generatedAt ? previous.filter((vehicle) => ids.has(Number(vehicle.ambulance_id)) ||
    new Date(vehicle.server_received_at || 0) >= new Date(generatedAt)) : previous;
  return (snapshot || []).reduce(mergeFleetState, base);
}
