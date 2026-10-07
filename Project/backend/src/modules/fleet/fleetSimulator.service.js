import crypto from 'crypto';
import { Op } from 'sequelize';
import Ambulance from '../ambulances/ambulance.model.js';
import Hospital from '../hospitals/hospital.model.js';
import Emergency from '../emergencies/emergency.model.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import fleetTrackerService from './fleetTracker.service.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';

export function moveToward(from, target, distanceMeters) {
  const latitudeMeters = (target.latitude - from.latitude) * 111320;
  const longitudeMeters = (target.longitude - from.longitude) * 111320 * Math.cos(from.latitude * Math.PI / 180);
  const remaining = Math.hypot(latitudeMeters, longitudeMeters);
  const fraction = remaining ? Math.min(1, distanceMeters / remaining) : 0;
  return { latitude: from.latitude + (target.latitude - from.latitude) * fraction,
    longitude: from.longitude + (target.longitude - from.longitude) * fraction,
    heading: (Math.atan2(longitudeMeters, latitudeMeters) * 180 / Math.PI + 360) % 360,
    moved: remaining * fraction, arrived: remaining <= distanceMeters };
}

export class FleetSimulator {
  constructor({ tracker = fleetTrackerService } = {}) {
    this.tracker = tracker;
    this.vehicles = new Map();
    this.running = false;
    this.paused = false;
    this.movement = null;
    this.heartbeats = null;
    this.config = null;
  }

  setVehicles(vehicles) {
    this.vehicles.clear();
    for (const vehicle of vehicles) {
      const home = { latitude: Number(vehicle.latitude), longitude: Number(vehicle.longitude) };
      this.vehicles.set(Number(vehicle.ambulance_id), { ...vehicle, ...home, home, waypoint: 0, online: true, returning: false, assignment_id: null });
    }
  }

  async provisionVehicles(count, startingLocation, ids = null) {
    const where = { is_simulated: true, is_active: true };
    if (ids) where.AmbulanceID = { [Op.in]: ids };
    const vehicles = await Ambulance.findAll({ where, order: [['AmbulanceID', 'ASC']], limit: count });
    if (ids && vehicles.length !== ids.length) throw new Error('Every requested ID must identify an active simulated ambulance.');
    if (vehicles.length < count && !ids) {
      const hospital = await Hospital.findOne({ where: { is_active: true }, order: [['HospitalID', 'ASC']] });
      if (!hospital) throw new Error('An active base hospital is required.');
      while (vehicles.length < count) {
        const code = 'SIM-' + crypto.randomUUID().slice(0, 12);
        vehicles.push(await Ambulance.create({ CurrentHospitalID: hospital.HospitalID, fleet_code: code, registration_number: code,
          Status: 'available', Fuel: 100, vehicle_type: 'ADVANCED_LIFE_SUPPORT', is_active: true, is_simulated: true,
          current_location_lat: startingLocation.latitude + vehicles.length * 0.001,
          current_location_lng: startingLocation.longitude + vehicles.length * 0.001 }));
      }
    }
    const live = await this.tracker.store.getMany(vehicles.map((vehicle) => vehicle.AmbulanceID));
    this.setVehicles(vehicles.map((vehicle) => ({ ambulance_id: vehicle.AmbulanceID, fleet_code: vehicle.fleet_code,
      latitude: live.get(vehicle.AmbulanceID)?.latitude ?? vehicle.current_location_lat ?? startingLocation.latitude,
      longitude: live.get(vehicle.AmbulanceID)?.longitude ?? vehicle.current_location_lng ?? startingLocation.longitude })));
  }

  async targetFor(vehicle, state) {
    const assignmentId = state?.assignment_id ?? null;
    if (assignmentId !== vehicle.assignment_id || state?.operational_status !== vehicle.operational_status) {
      if (vehicle.assignment_id && !assignmentId) vehicle.returning = true;
      vehicle.assignment_id = assignmentId;
      vehicle.operational_status = state?.operational_status;
      vehicle.incident = assignmentId ? await Emergency.findByPk(assignmentId) : null;
      vehicle.hospital = vehicle.incident?.assigned_hospital_id ? await Hospital.findByPk(vehicle.incident.assigned_hospital_id) : null;
    }
    if (state?.operational_status === 'EN_ROUTE_TO_SCENE') return vehicle.incident;
    if (state?.operational_status === 'TRANSPORTING') return vehicle.hospital;
    if (state?.operational_status && state.operational_status !== 'AVAILABLE') return null;
    if (vehicle.returning) return vehicle.home;
    const offsets = [[0.004, 0], [0.004, 0.004], [0, 0.004], [0, 0]];
    const offset = offsets[vehicle.waypoint % offsets.length];
    return { latitude: vehicle.home.latitude + offset[0], longitude: vehicle.home.longitude + offset[1] };
  }

  async runMovement() {
    if (this.paused) return [];
    const states = await this.tracker.store.getMany([...this.vehicles.keys()]);
    const now = Date.now();
    const seconds = Math.min(10, (now - (this.lastTickAt || now - this.config.updateIntervalMs)) / 1000);
    this.lastTickAt = now;
    const results = [];
    for (const vehicle of this.vehicles.values()) {
      if (!vehicle.online) continue;
      const target = this.config.mode === 'stationary' ? null : await this.targetFor(vehicle, states.get(vehicle.ambulance_id));
      const movement = target && hasValidCoordinates(target.latitude, target.longitude) ?
        moveToward(vehicle, { latitude: Number(target.latitude), longitude: Number(target.longitude) }, 30 / 3.6 * seconds) :
        { latitude: vehicle.latitude, longitude: vehicle.longitude, heading: 0, moved: 0, arrived: false };
      const result = await this.tracker.ingest({ ambulance_id: vehicle.ambulance_id, latitude: movement.latitude,
        longitude: movement.longitude, speed_kph: seconds > 0 ? movement.moved / seconds * 3.6 : 0,
        heading_degrees: movement.heading, gps_timestamp: new Date(now).toISOString(), is_simulated: true,
        event_id: 'sim-' + vehicle.ambulance_id + '-' + now }, { kind: 'simulator', sourceId: 'fleet-simulator' });
      if (result.accepted) Object.assign(vehicle, { latitude: movement.latitude, longitude: movement.longitude });
      if (movement.arrived) { vehicle.waypoint += 1; vehicle.returning = false; }
      results.push(result);
    }
    return results;
  }

  tick() {
    if (!this.movement) this.movement = this.runMovement().finally(() => { this.movement = null; });
    return this.movement;
  }

  heartbeatTick() {
    if (!this.heartbeats) this.heartbeats = Promise.all([...this.vehicles.values()].filter((vehicle) => vehicle.online).map((vehicle) =>
      this.tracker.heartbeat({ ambulance_id: vehicle.ambulance_id, is_simulated: true, heartbeat_timestamp: new Date().toISOString() },
        { kind: 'simulator', sourceId: 'fleet-simulator' }))).finally(() => { this.heartbeats = null; });
    return this.heartbeats;
  }

  async advanceLifecycle(ambulanceId, assignmentId, user) {
    if (!env.fleet.simulatorEnabled || !env.fleet.simulatorAllowActiveAssignments) throw new Error('Simulator lifecycle controls are disabled.');
    const vehicle = this.vehicles.get(Number(ambulanceId));
    const incident = await Emergency.findByPk(assignmentId || vehicle?.assignment_id);
    if (!vehicle || !incident?.is_simulated) throw new Error('A provisioned simulated vehicle and simulated incident are required.');
    const { default: emergencyService } = await import('../emergencies/emergency.service.js');
    if (!incident.assigned_ambulance_id) await emergencyService.assignAmbulance(incident.id, { ambulance_id: Number(ambulanceId) }, user);
    else {
      if (Number(incident.assigned_ambulance_id) !== Number(ambulanceId)) throw new Error('Incident is assigned to a different ambulance.');
      const next = { DISPATCHED: 'EN_ROUTE', EN_ROUTE: 'AT_PATIENT', AT_PATIENT: 'TRANSPORTING', TRANSPORTING: 'AT_HOSPITAL', AT_HOSPITAL: 'RESOLVED', RESOLVED: 'CLOSED' }[incident.status];
      if (!next) throw new Error('No simulator lifecycle transition is available.');
      await emergencyService.updateResponseLifecycleStatus(incident.id, { status: next, notes: 'Simulated operational confirmation.' }, user);
    }
    await this.tracker.syncOperationalState({ ambulanceId: Number(ambulanceId) });
    return this.tracker.getLiveStates([ambulanceId]).then((states) => states.get(Number(ambulanceId)));
  }

  setConnectivity(ambulanceId, online) {
    if (typeof online !== 'boolean' || !this.vehicles.has(Number(ambulanceId))) throw new Error('A simulated vehicle and boolean online flag are required.');
    this.vehicles.get(Number(ambulanceId)).online = online;
    return this.status();
  }

  async start(options = {}) {
    if (!env.fleet.simulatorEnabled || env.nodeEnv === 'production') throw Object.assign(new Error('Simulator is disabled in this environment.'), { status: 403 });
    if (this.running) return this.status();
    if (this.starting) return this.starting;
    this.starting = this.initialize(options).finally(() => { this.starting = null; });
    return this.starting;
  }

  async initialize(options) {
    const ids = options.ambulance_ids || null;
    if (ids && (!Array.isArray(ids) || !ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length)) throw new Error('ambulance_ids must be unique positive integer IDs.');
    const count = ids?.length || Number(options.count ?? env.fleet.simulatorVehicleCount);
    const updateIntervalMs = Number(options.update_interval_ms ?? env.fleet.simulatorUpdateIntervalMs);
    const heartbeatIntervalMs = Number(options.heartbeat_interval_ms ?? env.fleet.simulatorHeartbeatIntervalMs);
    const mode = options.mode || env.fleet.simulatorMode;
    const startingLocation = options.starting_location || { latitude: env.fleet.simulatorStartLatitude, longitude: env.fleet.simulatorStartLongitude };
    if (!Number.isSafeInteger(count) || count < 1 || count > env.fleet.simulatorMaxVehicles) throw new Error('Invalid fleet size.');
    if (!Number.isFinite(updateIntervalMs) || updateIntervalMs < 1000 || !Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs < 1000 ||
        60000 / updateIntervalMs + 60000 / heartbeatIntervalMs > env.fleet.telemetryMaxEventsPerMinute) throw new Error('Simulator intervals exceed the telemetry rate budget.');
    if (!['stationary', 'patrol'].includes(mode) || !hasValidCoordinates(startingLocation.latitude, startingLocation.longitude) ||
        Math.abs(startingLocation.latitude) > 85 || Math.abs(startingLocation.longitude) > 179) throw new Error('Invalid simulator mode or starting coordinates.');
    this.config = { count, updateIntervalMs, heartbeatIntervalMs, mode, startingLocation, route_source: 'DETERMINISTIC_NON_ROAD_SIMULATION' };
    await this.provisionVehicles(count, startingLocation, ids);
    this.paused = false;
    await this.tick();
    this.running = true;
    this.timer = setInterval(() => this.tick().catch(() => logger.warn('Simulator movement pending; retrying.')), updateIntervalMs);
    this.heartbeatTimer = setInterval(() => this.heartbeatTick().catch(() => logger.warn('Simulator heartbeat pending; retrying.')), heartbeatIntervalMs);
    return this.status();
  }

  pause() { this.paused = true; return this.status(); }
  resume() { if (!this.running) throw new Error('Simulator is not running.'); this.paused = false; this.lastTickAt = Date.now(); return this.status(); }
  async stop() {
    if (this.starting) await this.starting.catch(() => {});
    clearInterval(this.timer); clearInterval(this.heartbeatTimer);
    this.running = false;
    await Promise.allSettled([this.movement, this.heartbeats].filter(Boolean));
    return this.status();
  }
  status() { return { running: this.running, paused: this.paused, vehicles: [...this.vehicles.values()].map(({ ambulance_id, fleet_code, online }) => ({ ambulance_id, fleet_code, online })), config: this.config }; }
}

export const fleetSimulator = new FleetSimulator();
export default fleetSimulator;
