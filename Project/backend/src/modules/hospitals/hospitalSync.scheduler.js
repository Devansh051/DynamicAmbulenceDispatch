import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import hospitalSyncService from './hospitalSync.service.js';
import HospitalSyncHistory, { SYNC_STATUS, SYNC_TRIGGERS } from './hospitalSyncHistory.model.js';
import { Op } from 'sequelize';

class HospitalSyncScheduler {
  constructor() {
    this.timer = null;
    this.checkIntervalMs = 60 * 60 * 1000; // Check schedule every 1 hour
    this.isRunning = false;
  }

  get syncIntervalDays() {
    return env.dataGov.syncIntervalDays || 3;
  }

  /**
   * Initialize the automated 3-day synchronization scheduler
   */
  async init() {
    if (!env.dataGov.syncEnabled) {
      logger.info('[HospitalSyncScheduler] Hospital directory automated synchronization is disabled via HOSPITAL_SYNC_ENABLED=false.');
      return;
    }

    const intervalDays = env.dataGov.syncIntervalDays || 3;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
    logger.info(`[HospitalSyncScheduler] Initializing automated 3-day hospital synchronization (Interval: ${intervalDays} days / ${intervalMs / 3600000}h)...`);

    // Check if initial synchronization is needed on server startup
    this.startupTimer = setTimeout(async () => {
      try {
        await hospitalSyncService.recoverStaleRunningJobs();
        await this.checkAndRunSync();
      } catch (err) {
        logger.error(`[HospitalSyncScheduler] Startup sync check failed: ${err.message}`);
      }
    }, 15000); // 15 seconds delay after startup

    // Set recurring periodic check
    this.timer = setInterval(async () => {
      try {
        await this.checkAndRunSync();
      } catch (err) {
        logger.error(`[HospitalSyncScheduler] Recurring sync check failed: ${err.message}`);
      }
    }, this.checkIntervalMs);
  }

  /**
   * Check whether 72 hours have elapsed since the last successful sync and execute if due
   */
  async checkAndRunSync() {
    const intervalDays = env.dataGov.syncIntervalDays || 3;
    const intervalMs = intervalDays * 24 * 60 * 60 * 1000;

    const lastSuccess = await HospitalSyncHistory.findOne({
      where: {
        status: {
          [Op.in]: [SYNC_STATUS.COMPLETED, SYNC_STATUS.PARTIALLY_COMPLETED]
        }
      },
      order: [['completed_at', 'DESC']]
    });

    const now = Date.now();
    let shouldRun = false;

    if (!lastSuccess || !lastSuccess.completed_at) {
      logger.info('[HospitalSyncScheduler] No previous successful synchronization recorded. Synchronization is due.');
      shouldRun = true;
    } else {
      const elapsedMs = now - new Date(lastSuccess.completed_at).getTime();
      const remainingMs = intervalMs - elapsedMs;

      if (elapsedMs >= intervalMs) {
        logger.info(`[HospitalSyncScheduler] Last sync was ${(elapsedMs / 3600000).toFixed(1)} hours ago (Threshold: ${intervalDays * 24}h). Triggering scheduled sync.`);
        shouldRun = true;
      } else {
        logger.info(`[HospitalSyncScheduler] Next scheduled sync in ${(remainingMs / 3600000).toFixed(1)} hours.`);
      }
    }

    if (shouldRun) {
      await hospitalSyncService.performSync({
        trigger: SYNC_TRIGGERS.SCHEDULED,
        filters: {}
      });
    }
  }

  /**
   * Stop scheduler gracefully on process termination
   */
  stop() {
    clearTimeout(this.startupTimer);
    this.startupTimer = null;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[HospitalSyncScheduler] Automated hospital synchronization scheduler stopped.');
    }
  }
}

export const hospitalSyncScheduler = new HospitalSyncScheduler();
export default hospitalSyncScheduler;
