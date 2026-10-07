import sequelize from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import fleetStateStore from './fleetState.store.js';
import fleetEventBus, { FLEET_EVENTS } from './fleet.events.js';

export class FleetPersistenceWorker {
  constructor({ store = fleetStateStore, database = sequelize, intervalMs = 500 } = {}) {
    this.store = store;
    this.database = database;
    this.intervalMs = intervalMs;
    this.running = false;
    this.inFlight = null;
    this.failures = 0;
    this.nextAttemptAt = 0;
    this.metrics = { processed: 0, persisted: 0, retried: 0, failures: 0, queueDepth: 0 };
  }

  shouldPersistLocation(event) { return Boolean(event.has_location); }

  async persistBatch(events) {
    const locations = events.filter((event) => this.shouldPersistLocation(event));
    if (!locations.length) return;
    const payload = JSON.stringify(locations.map(({ _queue_token, ...event }) => event));
    const transaction = await this.database.transaction();
    try {
      await this.database.query(`
        INSERT INTO dbo.AmbulanceLocationHistory
          (event_id, ambulance_id, latitude, longitude, speed_kph, heading_degrees, operational_status,
           assignment_id, gps_event_timestamp, server_received_at, is_simulated, source_id)
        SELECT event_id, ambulance_id, latitude, longitude, speed_kph, heading_degrees, operational_status,
          assignment_id, gps_event_timestamp, server_received_at, is_simulated, source_id
        FROM OPENJSON(:payload) WITH (
          event_id VARCHAR(100), ambulance_id INT, latitude DECIMAL(10,7), longitude DECIMAL(10,7),
          speed_kph DECIMAL(7,2), heading_degrees DECIMAL(6,2), operational_status VARCHAR(40), assignment_id INT,
          gps_event_timestamp DATETIME2, server_received_at DATETIME2, is_simulated BIT, source_id VARCHAR(100)
        ) AS incoming
        WHERE NOT EXISTS (SELECT 1 FROM dbo.AmbulanceLocationHistory AS existing WITH (UPDLOCK, HOLDLOCK) WHERE existing.event_id = incoming.event_id);
        WITH latest AS (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY ambulance_id ORDER BY server_received_at DESC) AS row_number
          FROM OPENJSON(:payload) WITH (ambulance_id INT, latitude DECIMAL(10,7), longitude DECIMAL(10,7), server_received_at DATETIME2)
        )
        UPDATE ambulance SET current_location_lat = latest.latitude, current_location_lng = latest.longitude,
          telemetry_checkpoint_at = latest.server_received_at
        FROM dbo.Ambulances AS ambulance JOIN latest ON ambulance.AmbulanceID = latest.ambulance_id
        WHERE latest.row_number = 1 AND (ambulance.telemetry_checkpoint_at IS NULL OR ambulance.telemetry_checkpoint_at < latest.server_received_at);
      `, { replacements: { payload }, transaction });
      await transaction.commit();
      this.metrics.persisted += locations.length;
    } catch (error) {
      if (!transaction.finished) await transaction.rollback();
      throw error;
    }
  }

  async processBatch() {
    if (Date.now() < this.nextAttemptAt || !await this.store.acquireWorkerLease()) return 0;
    const renewer = setInterval(() => this.store.renewWorkerLease().catch(() => {}), 10000);
    try {
      await this.store.recoverPendingPersistenceEvents();
      const events = await this.store.popPersistenceBatch(env.fleet.persistenceBatchSize);
      this.metrics.queueDepth = (await this.store.getPersistenceQueueDepth()).total;
      if (!events.length) return 0;
      this.metrics.processed += events.length;
      await this.persistBatch(events);
      await this.store.acknowledgePersistenceEvents(events);
      this.failures = 0;
      return events.length;
    } catch (error) {
      this.failures += 1;
      this.metrics.failures += 1;
      this.metrics.retried += 1;
      this.nextAttemptAt = Date.now() + Math.min(30000, 1000 * 2 ** Math.min(this.failures, env.fleet.persistenceRetryLimit));
      fleetEventBus.emit(FLEET_EVENTS.PERSISTENCE_FAILURE, { message: 'Fleet history retained for retry.', retry_count: this.failures });
      logger.warn('Fleet persistence failed; claimed events retained for replay.');
      return 0;
    } finally {
      clearInterval(renewer);
      await this.store.releaseWorkerLease();
    }
  }

  drainOnce() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.processBatch().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(() => this.drainOnce().catch(() => logger.warn('Fleet worker waiting for Redis.')), this.intervalMs);
  }

  async stop({ drain = true } = {}) {
    this.running = false;
    clearInterval(this.timer);
    if (this.inFlight) await this.inFlight;
    if (drain) await this.drainOnce();
  }
}

export default FleetPersistenceWorker;
