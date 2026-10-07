import crypto from 'crypto';
import { Op } from 'sequelize';
import Ambulance from '../ambulances/ambulance.model.js';
import Emergency from '../emergencies/emergency.model.js';
import sequelize from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import fleetStateStore from './fleetState.store.js';
import fleetEventBus, { FLEET_EVENTS } from './fleet.events.js';
import { toPublicFleetState } from './fleetHealth.js';
import { operationalStatusForIncident, drainDispatchOutbox } from './fleetDispatchOutbox.js';
import { telemetryError, validateTelemetryPayload } from './telemetry.validation.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';

const activeStatuses = ['DISPATCHED', 'EN_ROUTE', 'AT_PATIENT', 'TRANSPORTING', 'AT_HOSPITAL'];
const databaseStatus = (ambulance) => String(ambulance.Status).toLowerCase() === 'available' ? 'AVAILABLE' : 'ASSIGNED';

export class FleetTrackerService {
  constructor({ store = fleetStateStore } = {}) {
    this.store = store;
    this.rateWindows = new Map();
    this.lastHealth = new Map();
    this.registry = new Map();
    this.assignments = new Map();
    this.registryAt = 0;
    this.monitoring = false;
  }

  healthOptions() { return { locationStaleMs: env.fleet.locationStaleMs, offlineMs: env.fleet.offlineMs }; }

  async registeredAmbulance(ambulanceId) {
    const cached = this.registry.get(Number(ambulanceId));
    if (cached && Date.now() - cached.cachedAt < 30000) return cached.ambulance;
    try {
      const ambulance = await Ambulance.findByPk(ambulanceId);
      if (ambulance) this.registry.set(Number(ambulanceId), { ambulance, cachedAt: Date.now() });
      else this.registry.delete(Number(ambulanceId));
      return ambulance;
    } catch (error) {
      if (cached && Date.now() - cached.cachedAt < 300000) return cached.ambulance;
      throw error;
    }
  }

  enforceRateLimit(ambulanceId, now) {
    const events = (this.rateWindows.get(ambulanceId) || []).filter((timestamp) => now - timestamp < 60000);
    if (events.length >= env.fleet.telemetryMaxEventsPerMinute) {
      throw Object.assign(telemetryError('Telemetry rate limit exceeded.', 'TELEMETRY_RATE_LIMITED'), { status: 429 });
    }
    events.push(now);
    this.rateWindows.set(ambulanceId, events);
  }

  async assertAmbulanceAndSource(normalized, principal) {
    if (!principal || !['user', 'simulator', 'device', 'internal'].includes(principal.kind)) {
      throw Object.assign(telemetryError('Telemetry identity required.', 'UNAUTHENTICATED'), { status: 401 });
    }
    if (normalized.sourceId && normalized.sourceId !== (principal.sourceId || principal.kind)) {
      throw Object.assign(telemetryError('Telemetry source does not match the authenticated identity.', 'SOURCE_ID_MISMATCH'), { status: 403 });
    }
    const ambulance = await this.registeredAmbulance(normalized.ambulanceId);
    if (!ambulance?.is_active) throw Object.assign(telemetryError('Ambulance unavailable.', 'AMBULANCE_NOT_FOUND'), { status: 404 });
    if (normalized.isSimulated !== Boolean(ambulance.is_simulated)) throw telemetryError('Simulation identity mismatch.', 'SIMULATION_IDENTITY_MISMATCH');
    if (principal.kind === 'device' && (normalized.isSimulated || Number(principal.ambulanceId) !== Number(ambulance.AmbulanceID))) {
      throw Object.assign(telemetryError('Device is not bound to this vehicle.', 'DEVICE_VEHICLE_FORBIDDEN'), { status: 403 });
    }
    if (principal.kind === 'simulator' && (!env.fleet.simulatorEnabled || env.nodeEnv === 'production' || !normalized.isSimulated)) {
      throw Object.assign(telemetryError('Simulation is disabled or vehicle is operational.', 'SIMULATOR_REAL_VEHICLE_FORBIDDEN'), { status: 403 });
    }
    if (principal.kind === 'user') {
      const user = principal.user;
      if (user?.status !== 'ACTIVE' || !['ADMIN', 'DISPATCHER', 'AMBULANCE_CREW'].includes(user.role)) {
        throw Object.assign(telemetryError('Account cannot report telemetry.', 'FORBIDDEN'), { status: 403 });
      }
      if (user.role === 'AMBULANCE_CREW' && Number(env.fleet.crewBindings[String(user.id)]) !== Number(ambulance.AmbulanceID)) {
        throw Object.assign(telemetryError('Crew is not bound to this vehicle.', 'CREW_TELEMETRY_NOT_BOUND'), { status: 403 });
      }
    }
    return ambulance;
  }

  publish(state, event = {}) {
    const publicState = toPublicFleetState(state, this.healthOptions());
    const previous = this.lastHealth.get(Number(state.ambulance_id));
    if (!previous || previous.revision !== state.revision || previous.epoch !== state.epoch || previous.health !== publicState.health) {
      fleetEventBus.emit(previous?.health !== publicState.health ? FLEET_EVENTS.HEALTH_CHANGED : FLEET_EVENTS.UPDATED,
        previous?.health !== publicState.health ? publicState : { state: publicState, event });
    }
    this.lastHealth.set(Number(state.ambulance_id), { revision: state.revision, epoch: state.epoch, health: publicState.health });
    return publicState;
  }

  async ingest(payload, principal, { requireLocation = true } = {}) {
    const receivedAt = new Date();
    const normalized = validateTelemetryPayload(payload, { requireLocation, now: receivedAt.getTime() });
    const ambulance = await this.assertAmbulanceAndSource(normalized, principal);
    this.enforceRateLimit(normalized.ambulanceId, receivedAt.getTime());
    const previous = await this.store.get(normalized.ambulanceId);
    let status = previous?.operational_status;
    let assignmentId = previous?.assignment_id ?? null;
    if (!status) {
      const incident = await Emergency.findOne({ where: { assigned_ambulance_id: normalized.ambulanceId, status: { [Op.in]: activeStatuses } } });
      status = incident ? operationalStatusForIncident(incident.status) : databaseStatus(ambulance);
      assignmentId = incident?.id ?? null;
    }
    if ((normalized.operationalStatus && normalized.operationalStatus !== status) ||
        (normalized.assignmentId !== null && normalized.assignmentId !== assignmentId)) {
      throw telemetryError('Operational changes must use the authorized incident lifecycle API.', 'OPERATIONAL_STATE_CONFLICT');
    }
    if (normalized.hasLocation && previous?.last_gps_at_ms && normalized.eventTimestamp.getTime() > previous.last_gps_at_ms) {
      const radians = Math.PI / 180;
      const latitudeDelta = (normalized.latitude - previous.latitude) * radians;
      const longitudeDelta = (normalized.longitude - previous.longitude) * radians;
      const distance = 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(previous.latitude * radians) * Math.cos(normalized.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2)));
      const seconds = (normalized.eventTimestamp.getTime() - previous.last_gps_at_ms) / 1000;
      if (distance > 150 + seconds * 250 / 3.6) throw telemetryError('Implausible location jump.', 'IMPOSSIBLE_MOVEMENT');
    }
    const timestamp = requireLocation ? normalized.eventTimestamp : normalized.heartbeatTimestamp;
    const event = { kind: requireLocation ? 'TELEMETRY' : 'HEARTBEAT', event_id: crypto.createHash('sha256').update(normalized.ambulanceId + ':' + (principal.sourceId || principal.kind) + ':' + (normalized.eventId || crypto.randomUUID())).digest('hex'),
      ambulance_id: normalized.ambulanceId, latitude: normalized.latitude, longitude: normalized.longitude,
      speed_kph: normalized.speedKph, heading_degrees: normalized.headingDegrees, has_location: normalized.hasLocation,
      operational_status: status, assignment_id: assignmentId, gps_event_timestamp: normalized.eventTimestamp.toISOString(),
      server_received_at: receivedAt.toISOString(), is_simulated: normalized.isSimulated, source_id: principal.sourceId || principal.kind };
    const result = await this.store.update({ ...event, fleet_code: ambulance.fleet_code,
      authoritative: false, device_heartbeat: !requireLocation, device_event_at_ms: timestamp.getTime(),
      last_gps_at: normalized.eventTimestamp.toISOString(), last_gps_at_ms: normalized.eventTimestamp.getTime(),
      received_at: receivedAt.toISOString(), received_at_ms: receivedAt.getTime() }, event);
    const state = result.accepted ? this.publish(result.state, { kind: event.kind, accepted_location: result.accepted_location }) : toPublicFleetState(result.state, this.healthOptions());
    return { accepted: result.accepted, duplicate_or_out_of_order: !result.accepted, sampled_for_history: Boolean(result.queued), state };
  }

  async heartbeat(payload, principal) {
    if (payload.latitude !== undefined || payload.longitude !== undefined) throw telemetryError('Use telemetry for GPS points; heartbeat carries no coordinates.');
    return this.ingest(payload, principal, { requireLocation: false });
  }

  async syncOperationalState({ ambulanceId, operationalStatus, assignmentId = null, operationVersion, eventId }) {
    if (!operationVersion) {
      const [rows] = await sequelize.query('SELECT TOP (1) * FROM dbo.FleetDispatchOutbox WHERE ambulance_id = :id ORDER BY id DESC', { replacements: { id: ambulanceId } });
      if (!rows.length) return;
      const row = rows[0];
      operationalStatus = row.operational_status;
      assignmentId = row.assignment_id;
      operationVersion = Number(row.id);
      eventId = row.event_id;
    }
    const ambulance = await this.registeredAmbulance(ambulanceId);
    if (!ambulance) return;
    const now = new Date();
    const result = await this.store.update({ ambulance_id: Number(ambulanceId), fleet_code: ambulance.fleet_code,
      operational_status: operationalStatus, assignment_id: assignmentId, authoritative: true, operation_version: operationVersion,
      already_persisted: true, has_location: false, device_heartbeat: false, is_simulated: Boolean(ambulance.is_simulated),
      received_at: now.toISOString(), received_at_ms: now.getTime(), source_id: 'dispatch' }, { event_id: eventId });
    if (result.accepted) this.publish(result.state, { kind: 'STATUS', status_changed: true });
    return result;
  }

  async getLiveStates(ambulanceIds) {
    const states = await this.store.getMany(ambulanceIds);
    return new Map([...states.entries()].map(([id, state]) => [Number(id), toPublicFleetState(state, this.healthOptions())]));
  }

  async getSnapshot() {
    let states = [];
    try { states = await this.store.snapshot(); } catch { states = []; }
    if (Date.now() - this.registryAt > 10000) {
      try {
        const [ambulances, incidents] = await Promise.all([
          Ambulance.findAll({ where: { is_active: true } }),
          Emergency.findAll({ where: { status: { [Op.in]: activeStatuses }, assigned_ambulance_id: { [Op.ne]: null } },
            attributes: ['id', 'assigned_ambulance_id', 'status'] })
        ]);
        this.registry = new Map(ambulances.map((ambulance) => [Number(ambulance.AmbulanceID), { ambulance, cachedAt: Date.now() }]));
        this.assignments = new Map(incidents.map((incident) => [Number(incident.assigned_ambulance_id), incident]));
        this.registryAt = Date.now();
      } catch (error) { if (!this.registry.size && !states.length) throw error; }
    }
    const live = new Map(states.map((state) => [Number(state.ambulance_id), state]));
    const fleet = [...this.registry.values()].map(({ ambulance }) => live.get(Number(ambulance.AmbulanceID)) || {
      ambulance_id: ambulance.AmbulanceID, fleet_code: ambulance.fleet_code,
      latitude: ambulance.current_location_lat, longitude: ambulance.current_location_lng,
      operational_status: operationalStatusForIncident(this.assignments.get(Number(ambulance.AmbulanceID))?.status) || databaseStatus(ambulance),
      assignment_id: this.assignments.get(Number(ambulance.AmbulanceID))?.id ?? null,
      is_simulated: Boolean(ambulance.is_simulated),
      restored_from_database: true, last_gps_at: null, last_heartbeat_at: null, revision: 0
    });
    return (this.registry.size ? fleet : states).map((state) => toPublicFleetState(state, this.healthOptions()));
  }

  async monitorHealth() {
    if (this.monitoring) return 0;
    this.monitoring = true;
    try {
      await drainDispatchOutbox(this).catch(() => logger.warn('Dispatch outbox pending; retrying on the next monitor cycle.'));
      const states = await this.store.snapshot();
      for (const state of states) this.publish(state);
      return states.length;
    } finally { this.monitoring = false; }
  }

  async getPersistenceHealth() { return this.store.getPersistenceQueueDepth(); }
  isDispatchEligibleLiveState(state) { return state?.health === 'ONLINE' || !env.fleet.dispatchRequireOnline; }
}

export const fleetTrackerService = new FleetTrackerService();
export default fleetTrackerService;
