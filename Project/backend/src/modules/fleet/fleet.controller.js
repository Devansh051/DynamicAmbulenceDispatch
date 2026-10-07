import env from '../../config/env.js';
import { formatSuccess } from '../../utils/responseFormatter.js';
import fleetTrackerService from './fleetTracker.service.js';
import fleetSimulator from './fleetSimulator.service.js';

const rejectOversizedPayload = (req) => {
  const bytes = Buffer.byteLength(JSON.stringify(req.body || {}), 'utf8');
  if (bytes > env.fleet.telemetryMaxPayloadBytes) {
    const error = new Error(`Telemetry payload exceeds ${env.fleet.telemetryMaxPayloadBytes} bytes.`);
    error.status = 413;
    error.code = 'TELEMETRY_PAYLOAD_TOO_LARGE';
    throw error;
  }
};

export const ingestTelemetry = async (req, res, next) => {
  try {
    rejectOversizedPayload(req);
    const result = await fleetTrackerService.ingest(req.body, req.telemetryPrincipal);
    res.status(result.accepted ? 202 : 200).json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
};

export const ingestHeartbeat = async (req, res, next) => {
  try {
    rejectOversizedPayload(req);
    const result = await fleetTrackerService.heartbeat(req.body, req.telemetryPrincipal);
    res.status(202).json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
};

export const getFleetSnapshot = async (req, res, next) => {
  try {
    const generatedAt = new Date().toISOString();
    const fleet = await fleetTrackerService.getSnapshot();
    res.json(formatSuccess({
      fleet,
      generated_at: generatedAt,
      redis_live: fleetTrackerService.store.isRedisReady(),
      contracts_version: 'phase5-fleet-v1'
    }));
  } catch (error) {
    next(error);
  }
};

export const getFleetAmbulance = async (req, res, next) => {
  try {
    const fleet = await fleetTrackerService.getLiveStates([req.params.id]);
    const state = fleet.get(Number(req.params.id)) || null;
    res.json(formatSuccess(state));
  } catch (error) {
    next(error);
  }
};

export const getFleetHealth = async (req, res, next) => {
  try {
    const [monitored, persistence] = await Promise.all([
      fleetTrackerService.monitorHealth(),
      fleetTrackerService.getPersistenceHealth()
    ]);
    res.json(formatSuccess({ monitored, thresholds: {
      heartbeat_interval_ms: env.fleet.heartbeatIntervalMs,
      location_stale_ms: env.fleet.locationStaleMs,
      offline_ms: env.fleet.offlineMs
    }, persistence }));
  } catch (error) {
    next(error);
  }
};

export const startSimulator = async (req, res, next) => {
  try {
    const result = await fleetSimulator.start(req.body || {});
    res.status(202).json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
};

export const pauseSimulator = async (req, res, next) => {
  try {
    res.json(formatSuccess(fleetSimulator.pause()));
  } catch (error) {
    next(error);
  }
};

export const resumeSimulator = async (req, res, next) => {
  try {
    res.json(formatSuccess(fleetSimulator.resume()));
  } catch (error) {
    next(error);
  }
};

export const stopSimulator = async (req, res, next) => {
  try {
    res.json(formatSuccess(await fleetSimulator.stop()));
  } catch (error) {
    next(error);
  }
};

export const advanceSimulatorLifecycle = async (req, res, next) => {
  try {
    const result = await fleetSimulator.advanceLifecycle(req.params.id, req.body?.assignment_id ?? null, req.user);
    res.json(formatSuccess(result));
  } catch (error) {
    next(error);
  }
};
