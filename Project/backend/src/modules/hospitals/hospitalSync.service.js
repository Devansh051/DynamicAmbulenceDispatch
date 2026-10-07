import { Op } from 'sequelize';
import sequelize from '../../config/database.js';
import Hospital, { DATA_SOURCES, VERIFICATION_STATUSES, DATA_FRESHNESS } from './hospital.model.js';
import HospitalSyncHistory, { SYNC_STATUS, SYNC_TRIGGERS } from './hospitalSyncHistory.model.js';
import dataGovService from './dataGov.service.js';
import googleMapsService from './googleMaps.service.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';

// Phase 4 Specification Source of Truth: 250 meters matching threshold
export const HOSPITAL_MATCHING_PROXIMITY_THRESHOLD_METERS = 250;

class HospitalSyncService {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Helper to normalize facility names for cautious comparison
   */
  normalizeName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Safe distributed lock acquisition via SQL Server sp_getapplock
   */
  async acquireDistributedLock() {
    try {
      this.lockTransaction = await sequelize.transaction();
      const [result] = await sequelize.query(`
        DECLARE @res INT;
        EXEC @res = sp_getapplock
          @Resource = 'HospitalSync_ExecutionLock',
          @LockMode = 'Exclusive',
          @LockOwner = 'Transaction',
          @LockTimeout = 0;
        SELECT @res AS lockResult;
      `, { transaction: this.lockTransaction });
      const code = result[0]?.lockResult;
      // 0: Lock granted synchronously, 1: Lock granted after wait, <0: Failed / Timeout
      return typeof code === 'number' && code >= 0;
    } catch (err) {
      await this.releaseDistributedLock();
      throw err;
    }
  }

  /**
   * Release SQL Server distributed lock
   */
  async releaseDistributedLock() {
    const transaction = this.lockTransaction;
    this.lockTransaction = null;
    if (transaction && !transaction.finished) await transaction.rollback();
  }

  /**
   * Clear any stale RUNNING records from previous crashed server instances
   */
  async recoverStaleRunningJobs() {
    try {
      const staleThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes
      const [updatedCount] = await HospitalSyncHistory.update(
        {
          status: SYNC_STATUS.FAILED,
          completed_at: new Date(),
          error_details: 'Synchronization job timed out or crashed unexpectedly; stale lock cleared by recovery handler.'
        },
        {
          where: {
            status: SYNC_STATUS.RUNNING,
            started_at: { [Op.lt]: staleThreshold }
          }
        }
      );
      if (updatedCount > 0) {
        logger.warn(`[HospitalSyncService] Recovered ${updatedCount} stale/crashed RUNNING sync records.`);
      }
      return updatedCount || 0;
    } catch (err) {
      logger.error(`[HospitalSyncService] Error during stale job recovery: ${err.message}`);
      return 0;
    }
  }

  /**
   * Execute synchronization against data.gov.in NIN health facilities registry
   */
  async performSync({ trigger = SYNC_TRIGGERS.SCHEDULED, filters = {}, maxPages = 20 } = {}) {
    // 1. In-memory concurrency check
    if (this.isSyncing) {
      logger.warn('[HospitalSyncService] Synchronization is already active in memory. Skipping concurrent run.');
      const active = await HospitalSyncHistory.findOne({
        where: { status: SYNC_STATUS.RUNNING },
        order: [['started_at', 'DESC']]
      });
      return {
        success: false,
        message: 'A synchronization operation is already in progress.',
        syncJob: active
      };
    }

    this.isSyncing = true;
    try {
    // 2. Recover any crashed or stale jobs before checking active state
    await this.recoverStaleRunningJobs();

    // 3. Database-backed distributed lock (multi-instance coordination)
    const lockAcquired = await this.acquireDistributedLock();
    if (!lockAcquired) {
      logger.warn('[HospitalSyncService] Could not acquire distributed database lock (another instance is syncing).');
      const active = await HospitalSyncHistory.findOne({
        where: { status: SYNC_STATUS.RUNNING },
        order: [['started_at', 'DESC']]
      });
      return {
        success: false,
        message: 'Another backend instance is currently executing synchronization.',
        syncJob: active
      };
    }

    // 4. Check DB status to prevent overlapping across instances
    const runningInDb = await HospitalSyncHistory.findOne({
      where: {
        status: SYNC_STATUS.RUNNING,
        started_at: { [Op.gte]: new Date(Date.now() - 30 * 60 * 1000) }
      }
    });

    if (runningInDb) {
      await this.releaseDistributedLock();
      logger.warn(`[HospitalSyncService] Active sync found in DB (${runningInDb.sync_id}). Skipping concurrent trigger.`);
      return {
        success: false,
        message: 'Another synchronization job is currently running.',
        syncJob: runningInDb
      };
    }

    this.isSyncing = true;
    const syncId = `SYNC-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
    const startTime = new Date();

    const historyRecord = await HospitalSyncHistory.create({
      sync_id: syncId,
      trigger_type: trigger,
      started_at: startTime,
      status: SYNC_STATUS.RUNNING
    });

    logger.info(`[HospitalSyncService] Starting synchronization job [${syncId}] (Trigger: ${trigger})...`);

    let totalFetched = 0;
    let recordsInserted = 0;
    let recordsUpdated = 0;
    let recordsSkipped = 0;
    let recordsFailed = 0;
    const errorDetails = [];

    try {
      // Fetch records from data.gov.in
      const datasetResult = await dataGovService.fetchAllHealthFacilities({
        maxPages,
        batchLimit: 50,
        filters
      });

      const incomingFacilities = datasetResult.records || [];
      totalFetched = incomingFacilities.length;
      logger.info(`[HospitalSyncService] Processing ${totalFetched} facilities from data.gov.in...`);

      // Load existing hospitals from local database for rapid matching
      const existingHospitals = await Hospital.findAll({
        attributes: [
          'HospitalID',
          'HospitalName',
          'government_id',
          'hfr_id',
          'google_place_id',
          'address',
          'latitude',
          'longitude',
          'city',
          'district',
          'state',
          'phone',
          'verification_status',
          'data_source'
        ]
      });

      // Build lookup maps for rapid matching
      const govIdMap = new Map();
      const existingList = [];

      for (const h of existingHospitals) {
        if (h.government_id) govIdMap.set(String(h.government_id).trim(), h);
        if (h.hfr_id) govIdMap.set(String(h.hfr_id).trim(), h);
        existingList.push({
          hospital: h,
          normName: this.normalizeName(h.HospitalName),
          lat: h.latitude !== null && h.latitude !== undefined ? parseFloat(h.latitude) : null,
          lng: h.longitude !== null && h.longitude !== undefined ? parseFloat(h.longitude) : null
        });
      }

      // Process each incoming facility with Phase 4 matching rules
      for (const fac of incomingFacilities) {
        try {
          if (!fac.facility_name) {
            recordsSkipped++;
            continue;
          }

          let matchedHospital = null;

          // Rule A: Match by stable government identifier (NIN / HFR ID)
          if (fac.government_id && govIdMap.has(String(fac.government_id).trim())) {
            matchedHospital = govIdMap.get(String(fac.government_id).trim());
          }

          // Rule B: Cautious matching by normalized name + proximity (< 250m)
          // Follow original Phase 4 specification: 250-metre threshold (not 500m)
          // Do not automatically merge ambiguous matches!
          if (!matchedHospital && hasValidCoordinates(fac.latitude, fac.longitude)) {
            const facLat = parseFloat(fac.latitude);
            const facLng = parseFloat(fac.longitude);

            if (!isNaN(facLat) && !isNaN(facLng)) {
              const facNormName = this.normalizeName(fac.facility_name);
              const candidateMatches = [];

              for (const item of existingList) {
                if (item.lat !== null && item.lng !== null) {
                  const dist = googleMapsService.calculateHaversineDistance(
                    facLat,
                    facLng,
                    item.lat,
                    item.lng
                  );

                  // 250-metre Phase 4 specification threshold
                  if (dist < HOSPITAL_MATCHING_PROXIMITY_THRESHOLD_METERS) {
                    // Exact normalized name match - never use loose substring inclusion!
                    if (item.normName === facNormName) {
                      // Disqualify if candidate already has a conflicting government ID
                      if (fac.government_id && item.hospital.government_id && String(item.hospital.government_id).trim() !== String(fac.government_id).trim()) {
                        continue;
                      }
                      candidateMatches.push({ item, dist });
                    }
                  }
                }
              }

              // Ambiguity check: if exactly 1 match found, merge safely.
              // If multiple matches found within 250m, it is ambiguous - DO NOT merge!
              if (candidateMatches.length === 1) {
                matchedHospital = candidateMatches[0].item.hospital;
              } else if (candidateMatches.length > 1) {
                logger.warn(`[HospitalSyncService] Ambiguous match: ${candidateMatches.length} hospitals matched '${fac.facility_name}' within ${HOSPITAL_MATCHING_PROXIMITY_THRESHOLD_METERS}m. Skipping automatic merge.`);
              }
            }
          }

          if (matchedHospital) {
            // Update existing record safely preserving manually verified info and provenance
            const isManuallyVerified = matchedHospital.verification_status === VERIFICATION_STATUSES.VERIFIED && matchedHospital.data_source === DATA_SOURCES.MANUAL;

            const updates = {
              last_synced_at: new Date(),
              data_freshness: DATA_FRESHNESS.FRESH
            };

            // If not manually verified, update registry fields
            if (!isManuallyVerified) {
              if (fac.government_id && !matchedHospital.government_id) {
                updates.government_id = fac.government_id;
              }
              if (fac.address && !matchedHospital.address) {
                updates.address = fac.address;
              }
              if (fac.phone && !matchedHospital.phone) {
                updates.phone = fac.phone;
              }
              if (fac.district && !matchedHospital.district) {
                updates.district = fac.district;
              }
              if (hasValidCoordinates(fac.latitude, fac.longitude) && !hasValidCoordinates(matchedHospital.latitude, matchedHospital.longitude)) {
                updates.latitude = fac.latitude;
                updates.longitude = fac.longitude;
              }
              if (matchedHospital.data_source !== DATA_SOURCES.LEGACY_SEED) {
                updates.data_source = DATA_SOURCES.GOV_DIRECTORY;
              }
            }

            await matchedHospital.update(updates);
            recordsUpdated++;
          } else {
            // Insert new record safely preventing duplicates
            let targetName = fac.facility_name.substring(0, 50).trim();
            const nameExists = existingList.some(e => e.normName === this.normalizeName(targetName));

            if (nameExists && fac.district) {
              const suffix = ` (${fac.district})`;
              targetName = (targetName.substring(0, 50 - suffix.length) + suffix).substring(0, 50);
            }

            // Get next ID atomically
            const [idResult] = await sequelize.query(
              'SELECT COALESCE(MAX(HospitalID), 0) + 1 AS nextId FROM dbo.Hospitals'
            );
            const nextHospitalId = idResult[0]?.nextId || (existingHospitals.length + 1);

            const newHospital = await Hospital.create({
              HospitalID: nextHospitalId,
              legacy_id: nextHospitalId,
              HospitalName: targetName,
              Location: (fac.address || `${fac.district || 'Bengaluru'}, ${fac.state || 'Karnataka'}`).substring(0, 100),
              government_id: fac.government_id || null,
              address: fac.address || null,
              city: fac.district || 'Bengaluru',
              district: fac.district || 'Bengaluru',
              state: fac.state || 'Karnataka',
              postal_code: fac.postal_code || null,
              latitude: fac.latitude ?? null,
              longitude: fac.longitude ?? null,
              facility_type: fac.facility_type || 'GENERAL_HOSPITAL',
              ownership: fac.ownership || 'PUBLIC',
              phone: fac.phone || null,
              emergency_services: Boolean(fac.emergency_services),
              data_source: DATA_SOURCES.GOV_DIRECTORY,
              verification_status: VERIFICATION_STATUSES.VERIFIED,
              data_freshness: DATA_FRESHNESS.FRESH,
              is_active: true,
              last_imported_at: new Date(),
              last_synced_at: new Date()
            });

            // Register in in-memory lookup immediately to prevent intra-batch duplicate creation
            if (fac.government_id) govIdMap.set(String(fac.government_id).trim(), newHospital);
            existingList.push({
              hospital: newHospital,
              normName: this.normalizeName(targetName),
              lat: fac.latitude ? parseFloat(fac.latitude) : null,
              lng: fac.longitude ? parseFloat(fac.longitude) : null
            });

            recordsInserted++;
          }
        } catch (recordErr) {
          recordsFailed++;
          errorDetails.push(`Record [${fac.facility_name || 'unnamed'}]: ${recordErr.message}`);
          if (errorDetails.length > 50) errorDetails.shift();
        }
      }

      const completedTime = new Date();
      const durationMs = completedTime.getTime() - startTime.getTime();
      const finalStatus =
        recordsFailed === 0
          ? SYNC_STATUS.COMPLETED
          : recordsInserted + recordsUpdated > 0
          ? SYNC_STATUS.PARTIALLY_COMPLETED
          : SYNC_STATUS.FAILED;

      await historyRecord.update({
        completed_at: completedTime,
        duration_ms: durationMs,
        status: finalStatus,
        total_fetched: totalFetched,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        records_skipped: recordsSkipped,
        records_failed: recordsFailed,
        error_details: errorDetails.length > 0 ? errorDetails.join('\n') : null
      });

      logger.info(
        `[HospitalSyncService] Sync [${syncId}] finished in ${durationMs}ms: inserted=${recordsInserted}, updated=${recordsUpdated}, skipped=${recordsSkipped}, failed=${recordsFailed}.`
      );

      return {
        success: finalStatus !== SYNC_STATUS.FAILED,
        syncId,
        durationMs,
        status: finalStatus,
        stats: {
          totalFetched,
          recordsInserted,
          recordsUpdated,
          recordsSkipped,
          recordsFailed
        }
      };
    } catch (syncErr) {
      const completedTime = new Date();
      const durationMs = completedTime.getTime() - startTime.getTime();
      logger.error(`[HospitalSyncService] Sync job [${syncId}] failed: ${syncErr.message}`);

      await historyRecord.update({
        completed_at: completedTime,
        duration_ms: durationMs,
        status: SYNC_STATUS.FAILED,
        error_details: syncErr.message
      });

      return {
        success: false,
        syncId,
        durationMs,
        status: SYNC_STATUS.FAILED,
        error: syncErr.message
      };
    }
    } finally {
      this.isSyncing = false;
      await this.releaseDistributedLock();
    }
  }

  /**
   * Get current sync status, last synchronization, and next scheduled synchronization
   */
  async getSyncStatus() {
    const syncIntervalDays = env.dataGov.syncIntervalDays || 3;
    const intervalMs = syncIntervalDays * 24 * 60 * 60 * 1000;

    await this.recoverStaleRunningJobs();

    const [currentSync, lastSync, lastSuccessfulSync] = await Promise.all([
      HospitalSyncHistory.findOne({
        where: { status: SYNC_STATUS.RUNNING },
        order: [['started_at', 'DESC']]
      }),
      HospitalSyncHistory.findOne({
        order: [['started_at', 'DESC']]
      }),
      HospitalSyncHistory.findOne({
        where: {
          status: {
            [Op.in]: [SYNC_STATUS.COMPLETED, SYNC_STATUS.PARTIALLY_COMPLETED]
          }
        },
        order: [['started_at', 'DESC']]
      })
    ]);

    let nextScheduledSync = null;
    if (lastSuccessfulSync && lastSuccessfulSync.completed_at) {
      nextScheduledSync = new Date(new Date(lastSuccessfulSync.completed_at).getTime() + intervalMs);
    } else {
      nextScheduledSync = new Date(); // Ready to run immediately
    }

    return {
      is_running: this.isSyncing || !!currentSync,
      current_sync: currentSync,
      last_sync: lastSync,
      last_successful_sync: lastSuccessfulSync,
      next_scheduled_sync: nextScheduledSync,
      sync_interval_days: syncIntervalDays,
      sync_enabled: env.dataGov.syncEnabled
    };
  }

  /**
   * Get paginated synchronization history
   */
  async getSyncHistory({ page = 1, limit = 10 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await HospitalSyncHistory.findAndCountAll({
      order: [['started_at', 'DESC']],
      limit: limitNum,
      offset
    });

    return {
      history: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum) || 1
      }
    };
  }
}

export const hospitalSyncService = new HospitalSyncService();
export default hospitalSyncService;
