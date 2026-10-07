import env from '../../config/env.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';

const OPERATIONAL_STATUS_ALIASES = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  ASSIGNED: 'ASSIGNED',
  DISPATCHED: 'ASSIGNED',
  BUSY: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE_TO_SCENE',
  EN_ROUTE_TO_SCENE: 'EN_ROUTE_TO_SCENE',
  ARRIVED_AT_SCENE: 'ARRIVED_AT_SCENE',
  AT_PATIENT: 'ARRIVED_AT_SCENE',
  TRANSPORTING: 'TRANSPORTING',
  ARRIVED_AT_HOSPITAL: 'ARRIVED_AT_HOSPITAL',
  AT_HOSPITAL: 'ARRIVED_AT_HOSPITAL'
});

export const OPERATIONAL_STATUSES = Object.freeze([
  'AVAILABLE',
  'ASSIGNED',
  'EN_ROUTE_TO_SCENE',
  'ARRIVED_AT_SCENE',
  'TRANSPORTING',
  'ARRIVED_AT_HOSPITAL'
]);

export const OPERATIONAL_TRANSITIONS = Object.freeze({
  AVAILABLE: ['AVAILABLE', 'ASSIGNED'],
  ASSIGNED: ['ASSIGNED', 'EN_ROUTE_TO_SCENE', 'AVAILABLE'],
  EN_ROUTE_TO_SCENE: ['EN_ROUTE_TO_SCENE', 'ARRIVED_AT_SCENE', 'AVAILABLE'],
  ARRIVED_AT_SCENE: ['ARRIVED_AT_SCENE', 'TRANSPORTING', 'AVAILABLE'],
  TRANSPORTING: ['TRANSPORTING', 'ARRIVED_AT_HOSPITAL'],
  ARRIVED_AT_HOSPITAL: ['ARRIVED_AT_HOSPITAL', 'AVAILABLE']
});

export const telemetryError = (message, code = 'INVALID_TELEMETRY') => {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
};

export const normalizeOperationalStatus = (status, fallback = 'AVAILABLE') => {
  if (!status) return fallback;
  return OPERATIONAL_STATUS_ALIASES[String(status).trim().toUpperCase()] || null;
};

export const isValidCoordinate = hasValidCoordinates;

export const isValidOperationalTransition = (fromStatus, toStatus) => {
  const from = normalizeOperationalStatus(fromStatus);
  const to = normalizeOperationalStatus(toStatus);
  return Boolean(from && to && OPERATIONAL_TRANSITIONS[from]?.includes(to));
};

const parseTimestamp = (value, fieldName, { required = true, now = Date.now() } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) throw telemetryError(`${fieldName} is required.`, 'TELEMETRY_TIMESTAMP_REQUIRED');
    return new Date(now);
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw telemetryError(fieldName + ' must be an ISO-8601 timestamp with timezone.', 'INVALID_TELEMETRY_TIMESTAMP');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw telemetryError(`${fieldName} must be an ISO-8601 timestamp.`, 'INVALID_TELEMETRY_TIMESTAMP');
  }
  // Clocks may drift slightly, but a packet from the far future is not trustworthy.
  if (parsed.getTime() > now + env.fleet.telemetryFutureSkewMs) {
    throw telemetryError(`${fieldName} is too far in the future.`, 'FUTURE_TELEMETRY_TIMESTAMP');
  }
  if (now - parsed.getTime() > env.fleet.telemetryMaxAgeMs) {
    throw telemetryError(fieldName + ' is too old.', 'STALE_TELEMETRY_TIMESTAMP');
  }
  return parsed;
};

/** Normalizes only untrusted wire fields; authorization is handled by the service. */
export function validateTelemetryPayload(payload, { requireLocation = true, now = Date.now() } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw telemetryError('Telemetry payload must be a JSON object.', 'INVALID_TELEMETRY_PAYLOAD');
  }

  const ambulanceId = payload.ambulance_id ?? payload.ambulanceId;
  if (!Number.isSafeInteger(ambulanceId) || ambulanceId <= 0) {
    throw telemetryError('ambulance_id must be a positive integer.', 'INVALID_AMBULANCE_ID');
  }

  for (const field of ['ambulance_id', 'ambulanceId', 'latitude', 'longitude', 'speed_kph', 'speed', 'heading_degrees', 'heading', 'assignment_id', 'incident_id']) {
    if (payload[field] !== undefined && (typeof payload[field] !== 'number' || !Number.isFinite(payload[field]))) {
      if (!['assignment_id', 'incident_id'].includes(field) || payload[field] !== null) throw telemetryError(field + ' must be a number.');
    }
  }
  if (payload.is_simulated !== undefined && typeof payload.is_simulated !== 'boolean') throw telemetryError('is_simulated must be a boolean.');
  if (payload.simulated !== undefined && typeof payload.simulated !== 'boolean') throw telemetryError('simulated must be a boolean.');
  const hasLocation = payload.latitude !== undefined || payload.longitude !== undefined;
  if (requireLocation && !hasLocation) {
    throw telemetryError('latitude and longitude are required for a telemetry update.', 'LOCATION_REQUIRED');
  }
  if (hasLocation && !isValidCoordinate(payload.latitude, payload.longitude)) {
    throw telemetryError('latitude must be between -90 and 90 and longitude between -180 and 180.', 'INVALID_COORDINATES');
  }

  const speedKph = payload.speed_kph ?? payload.speed;
  if (speedKph !== undefined && (!Number.isFinite(Number(speedKph)) || Number(speedKph) < 0 || Number(speedKph) > 250)) {
    throw telemetryError('speed_kph must be between 0 and 250.', 'INVALID_SPEED');
  }

  const heading = payload.heading_degrees ?? payload.heading;
  if (heading !== undefined && (!Number.isFinite(Number(heading)) || Number(heading) < 0 || Number(heading) >= 360)) {
    throw telemetryError('heading_degrees must be in the range 0 to <360.', 'INVALID_HEADING');
  }

  const normalizedStatus = normalizeOperationalStatus(payload.operational_status ?? payload.status, null);
  if ((payload.operational_status ?? payload.status) !== undefined && !normalizedStatus) {
    throw telemetryError(`operational_status must be one of: ${OPERATIONAL_STATUSES.join(', ')}.`, 'INVALID_OPERATIONAL_STATUS');
  }

  const assignmentId = payload.assignment_id ?? payload.incident_id ?? null;
  if (assignmentId !== null && assignmentId !== undefined && (!Number.isSafeInteger(Number(assignmentId)) || Number(assignmentId) <= 0)) {
    throw telemetryError('assignment_id must be a positive integer when supplied.', 'INVALID_ASSIGNMENT_ID');
  }

  const eventId = payload.event_id ?? payload.eventId ?? null;
  if (eventId !== null && (typeof eventId !== 'string' || eventId.length < 1 || eventId.length > 100)) {
    throw telemetryError('event_id must be a string up to 100 characters.', 'INVALID_EVENT_ID');
  }

  const sourceId = payload.source_id ?? payload.sourceId ?? null;
  if (sourceId !== null && (typeof sourceId !== 'string' || sourceId.length > 100)) {
    throw telemetryError('source_id must be a string up to 100 characters.', 'INVALID_SOURCE_ID');
  }

  return {
    ambulanceId,
    latitude: hasLocation ? Number(payload.latitude) : null,
    longitude: hasLocation ? Number(payload.longitude) : null,
    hasLocation,
    speedKph: speedKph === undefined ? null : Number(speedKph),
    headingDegrees: heading === undefined ? null : Number(heading),
    operationalStatus: normalizedStatus,
    assignmentId: assignmentId === null || assignmentId === undefined ? null : Number(assignmentId),
    eventTimestamp: parseTimestamp(payload.gps_timestamp ?? payload.event_timestamp ?? payload.timestamp, 'gps_timestamp', { required: requireLocation, now }),
    heartbeatTimestamp: parseTimestamp(payload.heartbeat_timestamp, 'heartbeat_timestamp', { required: false, now }),
    eventId,
    sourceId,
    isSimulated: Boolean(payload.is_simulated ?? payload.simulated)
  };
}
