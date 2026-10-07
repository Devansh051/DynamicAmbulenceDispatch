import app from './app.js';
import { createServer } from 'http';
import env from './config/env.js';
import logger from './utils/logger.js';
import sequelize, { checkDatabaseHealth } from './config/database.js';
import { registerShutdown } from './utils/shutdown.js';

import hospitalSyncScheduler from './modules/hospitals/hospitalSync.scheduler.js';
import fleetStateStore from './modules/fleet/fleetState.store.js';
import fleetTrackerService from './modules/fleet/fleetTracker.service.js';
import FleetPersistenceWorker from './modules/fleet/fleetPersistence.worker.js';
import fleetSimulator from './modules/fleet/fleetSimulator.service.js';
import { attachFleetSocketServer, closeFleetSocketServer } from './modules/fleet/fleet.socket.js';

let fleetPersistenceWorker = null;
let fleetHealthTimer = null;

const startServer = async () => {
  try {
    logger.info('Initializing EMS Dynamic Ambulance Dispatch Backend Server...');

    // Non-destructive initial database health check
    const dbStatus = await checkDatabaseHealth();
    if (dbStatus.connected) {
      logger.info(`✅ Database Connected: ${dbStatus.database} on ${dbStatus.server} (${dbStatus.latencyMs}ms)`);
      // Start Phase 4 automated 3-day hospital synchronization scheduler
      await hospitalSyncScheduler.init();
    } else {
      logger.warn(`⚠️ Database connection pending or unavailable on startup: ${dbStatus.error || 'Unknown error'}`);
    }

    await fleetStateStore.init();
    await fleetStateStore.subscribe((state) => fleetTrackerService.publish(state));
    const server = createServer(app);
    attachFleetSocketServer(server);
    if (env.fleet.persistenceWorkerEnabled) {
      fleetPersistenceWorker = new FleetPersistenceWorker();
      fleetPersistenceWorker.start();
    }
    fleetHealthTimer = setInterval(() => fleetTrackerService.monitorHealth().catch((error) => logger.warn(`Fleet health monitor error: ${error.message}`)), Math.min(1000, env.fleet.heartbeatIntervalMs, env.fleet.locationStaleMs));
    fleetHealthTimer.unref?.();

    server.listen(env.port, () => {
      logger.info(`🚀 EMS Backend Server listening on port ${env.port} [Environment: ${env.nodeEnv}]`);
      logger.info(`👉 Health Check: http://localhost:${env.port}/api/health`);
      logger.info(`👉 API v1: http://localhost:${env.port}/api/v1`);
    });

    registerShutdown([
      ['HTTP intake', () => { server.close(); server.closeIdleConnections(); }],
      ['schedulers', () => { hospitalSyncScheduler.stop(); clearInterval(fleetHealthTimer); }],
      ['simulator', () => fleetSimulator.stop()],
      ['fleet persistence', () => fleetPersistenceWorker?.stop({ drain: true })],
      ['sockets', closeFleetSocketServer],
      ['Redis', () => fleetStateStore.close()],
      ['SQL pool', () => sequelize.close()]
    ]);
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
