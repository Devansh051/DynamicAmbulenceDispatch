import app from './app.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { checkDatabaseHealth } from './config/database.js';

import hospitalSyncScheduler from './modules/hospitals/hospitalSync.scheduler.js';

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

    const server = app.listen(env.port, () => {
      logger.info(`🚀 EMS Backend Server listening on port ${env.port} [Environment: ${env.nodeEnv}]`);
      logger.info(`👉 Health Check: http://localhost:${env.port}/api/health`);
      logger.info(`👉 API v1: http://localhost:${env.port}/api/v1`);
    });

    const shutdown = (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      hospitalSyncScheduler.stop();
      server.close(() => {
        logger.info('HTTP server closed.');
        process.exit(0);
      });
      // Force shutdown after 10s if hanging
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

startServer();
