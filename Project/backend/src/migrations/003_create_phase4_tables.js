import sequelize from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Migration 003: Phase 4 Hospital Data Integration & Automated Synchronization
 * Non-destructive:
 * - Extends dbo.Hospitals with government_id, district, specialties, emergency_services, verification_status, data_freshness, sync timestamps.
 * - Creates dbo.HospitalSyncHistory to record automated 3-day sync jobs and manual admin triggers.
 * - Preserves all 15 legacy seeded hospitals and historical patient/route records.
 */
export async function up() {
  logger.info('Running migration 003_create_phase4_tables: UP...');

  // 1. Alter dbo.Hospitals to add Phase 4 fields
  await sequelize.query(`
    -- Add government_id (NIN identifier)
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'government_id')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD government_id VARCHAR(100) NULL;
    END

    -- Add district
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'district')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD district VARCHAR(100) NULL;
    END

    -- Add specialties (stored as JSON array)
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'specialties')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD specialties NVARCHAR(MAX) NULL;
    END

    -- Add emergency_services flag
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'emergency_services')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD emergency_services BIT NOT NULL CONSTRAINT DF_Hospitals_EmergencyServices DEFAULT 0;
    END

    -- Add verification_status ('UNVERIFIED', 'VERIFIED', 'CROSS_MATCHED')
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'verification_status')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD verification_status VARCHAR(50) NOT NULL CONSTRAINT DF_Hospitals_VerificationStatus DEFAULT 'UNVERIFIED';
    END

    -- Add data_freshness ('FRESH', 'OUTDATED', 'UNKNOWN')
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'data_freshness')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD data_freshness VARCHAR(50) NOT NULL CONSTRAINT DF_Hospitals_DataFreshness DEFAULT 'FRESH';
    END

    -- Add last_imported_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'last_imported_at')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD last_imported_at DATETIME2 NULL;
    END

    -- Add last_synced_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'last_synced_at')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD last_synced_at DATETIME2 NULL;
    END

    -- Add last_verified_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'last_verified_at')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD last_verified_at DATETIME2 NULL;
    END
  `);

  // Create indexes for government_id and coordinates if missing
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Hospitals_GovernmentId' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
    BEGIN
      CREATE INDEX IX_Hospitals_GovernmentId ON dbo.Hospitals(government_id) WHERE government_id IS NOT NULL;
    END

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Hospitals_LatLng' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
    BEGIN
      CREATE INDEX IX_Hospitals_LatLng ON dbo.Hospitals(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
    END
  `);

  // 2. Create dbo.HospitalSyncHistory table
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.HospitalSyncHistory', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.HospitalSyncHistory (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_HospitalSyncHistory PRIMARY KEY,
        sync_id VARCHAR(50) NOT NULL CONSTRAINT UQ_HospitalSyncHistory_SyncId UNIQUE,
        trigger_type VARCHAR(20) NOT NULL CONSTRAINT DF_HospitalSyncHistory_Trigger DEFAULT 'SCHEDULED',
        started_at DATETIME2 NOT NULL,
        completed_at DATETIME2 NULL,
        duration_ms INT NULL,
        status VARCHAR(30) NOT NULL,
        total_fetched INT NOT NULL CONSTRAINT DF_HospitalSyncHistory_Fetched DEFAULT 0,
        records_inserted INT NOT NULL CONSTRAINT DF_HospitalSyncHistory_Inserted DEFAULT 0,
        records_updated INT NOT NULL CONSTRAINT DF_HospitalSyncHistory_Updated DEFAULT 0,
        records_skipped INT NOT NULL CONSTRAINT DF_HospitalSyncHistory_Skipped DEFAULT 0,
        records_failed INT NOT NULL CONSTRAINT DF_HospitalSyncHistory_Failed DEFAULT 0,
        error_details NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_HospitalSyncHistory_CreatedAt DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_HospitalSyncHistory_UpdatedAt DEFAULT GETDATE()
      );

      CREATE INDEX IX_HospitalSyncHistory_Status ON dbo.HospitalSyncHistory(status);
      CREATE INDEX IX_HospitalSyncHistory_StartedAt ON dbo.HospitalSyncHistory(started_at DESC);
    END
  `);

  logger.info('✅ Migration 003_create_phase4_tables: UP completed.');
}

export async function down() {
  logger.info('Rolling back migration 003_create_phase4_tables: DOWN...');

  // 1. Drop dbo.HospitalSyncHistory
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.HospitalSyncHistory', N'U') IS NOT NULL
      DROP TABLE dbo.HospitalSyncHistory;
  `);

  // 2. Drop indexes on dbo.Hospitals
  await sequelize.query(`
    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Hospitals_GovernmentId' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
      DROP INDEX IX_Hospitals_GovernmentId ON dbo.Hospitals;

    IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Hospitals_LatLng' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
      DROP INDEX IX_Hospitals_LatLng ON dbo.Hospitals;
  `);

  // 3. Drop columns and constraints from dbo.Hospitals
  const columnsToDrop = [
    { col: 'government_id', df: null },
    { col: 'district', df: null },
    { col: 'specialties', df: null },
    { col: 'emergency_services', df: 'DF_Hospitals_EmergencyServices' },
    { col: 'verification_status', df: 'DF_Hospitals_VerificationStatus' },
    { col: 'data_freshness', df: 'DF_Hospitals_DataFreshness' },
    { col: 'last_imported_at', df: null },
    { col: 'last_synced_at', df: null },
    { col: 'last_verified_at', df: null }
  ];

  for (const { col, df } of columnsToDrop) {
    if (df) {
      await sequelize.query(`
        IF OBJECT_ID(N'dbo.${df}', N'D') IS NOT NULL
          ALTER TABLE dbo.Hospitals DROP CONSTRAINT ${df};
      `).catch(() => {});
    }
    await sequelize.query(`
      IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'${col}')
        ALTER TABLE dbo.Hospitals DROP COLUMN ${col};
    `).catch(() => {});
  }

  logger.info('✅ Migration 003_create_phase4_tables: DOWN completed.');
}

export default { up, down };
