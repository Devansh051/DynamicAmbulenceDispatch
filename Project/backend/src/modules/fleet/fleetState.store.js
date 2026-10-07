import { createClient } from 'redis';
import crypto from 'crypto';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';

const mergeScript = `
local incoming = cjson.decode(ARGV[1])
local event = cjson.decode(ARGV[2])
local current = cjson.decode(redis.call('GET', KEYS[1]) or '{}')
if redis.call('EXISTS', KEYS[7]) == 1 then return cjson.encode({state=current, accepted_location=false, accepted=false}) end
local previous = current.operational_status or incoming.operational_status
local location = incoming.has_location and tonumber(incoming.last_gps_at_ms) > tonumber(current.last_gps_at_ms or 0)
local status = incoming.authoritative and tonumber(incoming.operation_version or 0) > tonumber(current.operation_version or 0)
local heartbeat = incoming.device_heartbeat and tonumber(incoming.device_event_at_ms) > tonumber(current.device_event_at_ms or 0)
if incoming.has_location and not location then return cjson.encode({state=current, accepted_location=false, accepted=false}) end
if not location and not status and not heartbeat then return cjson.encode({state=current, accepted_location=false, accepted=false}) end
local changed = status and (current.operational_status ~= incoming.operational_status or current.assignment_id ~= incoming.assignment_id)
local sampled = location and tonumber(incoming.received_at_ms) - tonumber(current.last_sample_at_ms or 0) >= tonumber(ARGV[4])
local persist = sampled or (changed and not incoming.already_persisted)
if persist and redis.call('LLEN', KEYS[3]) + redis.call('LLEN', KEYS[4]) >= tonumber(ARGV[3]) then
  return cjson.encode({error='QUEUE_FULL'})
end
if location then
  current.latitude = incoming.latitude
  current.longitude = incoming.longitude
  current.speed_kph = incoming.speed_kph
  current.heading_degrees = incoming.heading_degrees
  current.last_gps_at = incoming.last_gps_at
  current.last_gps_at_ms = incoming.last_gps_at_ms
  current.last_gps_received_at = incoming.received_at
  current.last_gps_received_at_ms = incoming.received_at_ms
end
if status or not current.operational_status then
  current.operational_status = incoming.operational_status
  current.assignment_id = incoming.assignment_id
end
if status then current.operation_version = incoming.operation_version end
if heartbeat or location then
  current.last_heartbeat_at = incoming.received_at
  current.last_heartbeat_at_ms = incoming.received_at_ms
  current.device_event_at_ms = incoming.device_event_at_ms
end
current.ambulance_id = incoming.ambulance_id
current.fleet_code = incoming.fleet_code
current.is_simulated = incoming.is_simulated
current.source_id = incoming.source_id
current.server_received_at = incoming.received_at
current.restored_from_database = false
current.revision = redis.call('INCR', KEYS[5])
redis.call('SETNX', KEYS[8], ARGV[5])
current.epoch = redis.call('GET', KEYS[8])
if sampled then current.last_sample_at_ms = incoming.received_at_ms end
if persist then
  event.status_changed = changed or false
  event.previous_operational_status = previous
  event.operational_status = current.operational_status
  event.assignment_id = current.assignment_id
  event.has_location = sampled or false
  redis.call('LPUSH', KEYS[3], cjson.encode(event))
end
redis.call('SET', KEYS[7], '1', 'EX', 86400)
redis.call('SET', KEYS[1], cjson.encode(current))
redis.call('SADD', KEYS[2], incoming.ambulance_id)
redis.call('PUBLISH', KEYS[6], cjson.encode(current))
return cjson.encode({state=current, accepted_location=location or false, accepted=true, queued=persist or false, status_changed=changed or false})
`;

const unavailable = () => Object.assign(new Error('Fleet Redis is unavailable; retry telemetry with the same event timestamp.'), { status: 503, code: 'FLEET_STATE_UNAVAILABLE' });

export class FleetStateStore {
  constructor({ memory = false } = {}) {
    this.memoryEnabled = memory;
    this.memory = new Map();
    this.memoryQueue = [];
    this.memoryProcessing = [];
    this.client = null;
    this.ready = false;
    this.initializing = null;
    this.revision = 0;
    this.workerOwner = crypto.randomUUID();
  }

  key(name) { return env.fleet.redisPrefix + ':' + name; }
  stateKey(ambulanceId) { return this.key('ambulance:' + ambulanceId); }
  isRedisReady() { return Boolean(this.client?.isReady); }
  parse(raw) { return raw ? JSON.parse(raw) : null; }

  async init() {
    if (this.memoryEnabled) return false;
    if (this.initializing) return this.initializing;
    this.client = createClient({ url: env.fleet.redisUrl, disableOfflineQueue: true,
      socket: { connectTimeout: env.fleet.redisConnectTimeoutMs, reconnectStrategy: (attempt) => Math.min(500 * (attempt + 1), 10000) } });
    this.client.on('error', () => { this.ready = false; });
    this.client.on('ready', () => { this.ready = true; logger.info('Fleet Redis connected.'); });
    const connection = this.client.connect().catch(() => false);
    this.initializing = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), env.fleet.redisConnectTimeoutMs);
      connection.then(() => { clearTimeout(timer); resolve(this.isRedisReady()); });
    });
    return this.initializing;
  }

  requireReady() {
    if (!this.memoryEnabled && !this.isRedisReady()) throw unavailable();
  }

  mergeInMemory(incoming, event = null) {
    const current = this.memory.get(String(incoming.ambulance_id)) || {};
    const location = Boolean(incoming.has_location && Number(incoming.last_gps_at_ms) > Number(current.last_gps_at_ms || 0));
    const authoritative = incoming.authoritative ?? (incoming.status_at_ms !== undefined);
    const version = incoming.operation_version ?? incoming.status_at_ms ?? 0;
    const status = authoritative && Number(version) > Number(current.operation_version || 0);
    const heartbeat = incoming.device_heartbeat && Number(incoming.device_event_at_ms) > Number(current.device_event_at_ms || 0);
    if ((incoming.has_location && !location) || (!location && !status && !heartbeat)) return { state: current, accepted_location: false, accepted: false };
    const changed = Boolean(status && (current.operational_status !== incoming.operational_status || current.assignment_id !== incoming.assignment_id));
    const receivedMs = incoming.received_at_ms ?? incoming.last_heartbeat_at_ms;
    const sampled = location && receivedMs - Number(current.last_sample_at_ms || 0) >= env.fleet.persistenceSampleMs;
    if (event && (sampled || changed) && this.memoryQueue.length + this.memoryProcessing.length >= env.fleet.persistenceQueueMax) {
      throw Object.assign(new Error('Fleet history queue is full; retry later.'), { status: 503, code: 'FLEET_QUEUE_FULL' });
    }
    const next = { ...current, ambulance_id: incoming.ambulance_id, fleet_code: incoming.fleet_code,
      is_simulated: incoming.is_simulated, source_id: incoming.source_id, restored_from_database: false,
      server_received_at: incoming.received_at, revision: ++this.revision };
    if (location) Object.assign(next, { latitude: incoming.latitude, longitude: incoming.longitude,
      speed_kph: incoming.speed_kph, heading_degrees: incoming.heading_degrees, last_gps_at: incoming.last_gps_at,
      last_gps_at_ms: incoming.last_gps_at_ms, last_gps_received_at: incoming.received_at,
      last_gps_received_at_ms: receivedMs });
    if (status || !current.operational_status) Object.assign(next, { operational_status: incoming.operational_status, assignment_id: incoming.assignment_id });
    if (status) next.operation_version = version;
    if (location || heartbeat) Object.assign(next, { last_heartbeat_at: incoming.received_at ?? incoming.last_heartbeat_at,
      last_heartbeat_at_ms: receivedMs, device_event_at_ms: incoming.device_event_at_ms });
    if (sampled) next.last_sample_at_ms = receivedMs;
    if (event && (sampled || (changed && !incoming.already_persisted))) this.memoryQueue.push(JSON.stringify({ ...event, has_location: sampled,
      status_changed: changed, previous_operational_status: current.operational_status || incoming.operational_status,
      operational_status: next.operational_status, assignment_id: next.assignment_id }));
    this.memory.set(String(incoming.ambulance_id), next);
    return { state: next, accepted_location: location, accepted: true, queued: sampled || changed, status_changed: changed };
  }

  async update(incoming, event = {}) {
    this.requireReady();
    if (this.memoryEnabled) return this.mergeInMemory(incoming, event);
    const result = this.parse(await this.client.eval(mergeScript, {
      keys: [this.stateKey(incoming.ambulance_id), this.key('index'), this.key('persistence'), this.key('persistence:processing'), this.key('revision'), this.key('updates'), this.key('event:' + (event.event_id || crypto.randomUUID())), this.key('epoch')],
      arguments: [JSON.stringify(incoming), JSON.stringify(event), String(env.fleet.persistenceQueueMax), String(env.fleet.persistenceSampleMs), crypto.randomUUID()]
    }));
    if (result.error) throw Object.assign(new Error('Fleet history queue is full; retry later.'), { status: 503, code: 'FLEET_QUEUE_FULL' });
    return result;
  }

  async get(ambulanceId) {
    this.requireReady();
    return this.memoryEnabled ? this.memory.get(String(ambulanceId)) || null : this.parse(await this.client.get(this.stateKey(ambulanceId)));
  }

  async getMany(ambulanceIds) {
    this.requireReady();
    if (!ambulanceIds.length) return new Map();
    const states = this.memoryEnabled ? ambulanceIds.map((id) => this.memory.get(String(id))) :
      (await this.client.mGet(ambulanceIds.map((id) => this.stateKey(id)))).map((value) => this.parse(value));
    return new Map(states.filter(Boolean).map((state) => [Number(state.ambulance_id), state]));
  }

  async snapshot() {
    this.requireReady();
    if (this.memoryEnabled) return [...this.memory.values()];
    const ids = await this.client.sMembers(this.key('index'));
    return [...(await this.getMany(ids)).values()];
  }

  async subscribe(callback) {
    if (!this.client) return;
    this.subscriber = this.client.duplicate();
    this.subscriber.on('error', () => {});
    this.subscriber.connect().then(() => this.subscriber.subscribe(this.key('updates'), (raw) => {
      try { callback(this.parse(raw)); } catch { logger.warn('Invalid fleet notification ignored.'); }
    })).catch(() => logger.warn('Fleet subscription unavailable; health monitor will resynchronize.'));
  }

  async acquireWorkerLease() {
    this.requireReady();
    if (this.memoryEnabled) return true;
    return Boolean(await this.client.set(this.key('worker'), this.workerOwner, { NX: true, PX: 120000 }));
  }

  async renewWorkerLease() {
    if (this.memoryEnabled) return true;
    return Boolean(await this.client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE',KEYS[1],120000) end return 0", { keys: [this.key('worker')], arguments: [this.workerOwner] }));
  }

  async releaseWorkerLease() {
    if (this.memoryEnabled || !this.isRedisReady()) return;
    await this.client.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", { keys: [this.key('worker')], arguments: [this.workerOwner] });
  }

  async recoverPendingPersistenceEvents() {
    this.requireReady();
    if (this.memoryEnabled) {
      this.memoryQueue.unshift(...this.memoryProcessing.splice(0));
      return;
    }
    await this.client.eval("if redis.call('GET',KEYS[3]) ~= ARGV[1] then return 0 end local count=0 while redis.call('LMOVE',KEYS[1],KEYS[2],'LEFT','RIGHT') do count=count+1 end return count", {
      keys: [this.key('persistence:processing'), this.key('persistence'), this.key('worker')], arguments: [this.workerOwner]
    });
  }

  async popPersistenceBatch(size) {
    this.requireReady();
    let tokens;
    if (this.memoryEnabled) {
      tokens = this.memoryQueue.splice(0, size);
      this.memoryProcessing.push(...tokens);
    } else {
      tokens = await this.client.eval("if redis.call('GET',KEYS[3]) ~= ARGV[1] then return {} end local result={} for index=1,tonumber(ARGV[2]) do local token=redis.call('LMOVE',KEYS[1],KEYS[2],'RIGHT','LEFT') if not token then break end table.insert(result,token) end return result", {
        keys: [this.key('persistence'), this.key('persistence:processing'), this.key('worker')], arguments: [this.workerOwner, String(size)]
      });
    }
    return tokens.map((token) => ({ ...this.parse(token), _queue_token: token }));
  }

  async acknowledgePersistenceEvents(events) {
    if (this.memoryEnabled) {
      this.memoryProcessing = this.memoryProcessing.filter((token) => !events.some((event) => event._queue_token === token));
      return;
    }
    this.requireReady();
    const acknowledged = await this.client.eval("if redis.call('GET',KEYS[2]) ~= ARGV[1] then return 0 end for index=2,#ARGV do redis.call('LREM',KEYS[1],1,ARGV[index]) end return 1", {
      keys: [this.key('persistence:processing'), this.key('worker')], arguments: [this.workerOwner, ...events.map((event) => event._queue_token)]
    });
    if (!acknowledged) throw new Error('Fleet worker lease lost before acknowledgment; events retained for replay.');
  }

  async requeuePersistenceEvents() { await this.recoverPendingPersistenceEvents(); }

  async getPersistenceQueueDepth() {
    if (!this.memoryEnabled && !this.isRedisReady()) return { available: false, queued: null, processing: null, total: null, durable: false };
    const queued = this.memoryEnabled ? this.memoryQueue.length : await this.client.lLen(this.key('persistence'));
    const processing = this.memoryEnabled ? this.memoryProcessing.length : await this.client.lLen(this.key('persistence:processing'));
    return { available: true, queued, processing, total: queued + processing, durable: this.memoryEnabled ? false : null, storage: this.memoryEnabled ? 'MEMORY_TEST_ONLY' : 'REDIS', durability: this.memoryEnabled ? 'VOLATILE' : 'REDIS_CONFIGURATION_DEPENDENT' };
  }

  async close() {
    for (const client of [this.subscriber, this.client]) {
      if (client?.isOpen) await client.disconnect();
    }
    this.ready = false;
  }
}

export const fleetStateStore = new FleetStateStore();
export default fleetStateStore;
