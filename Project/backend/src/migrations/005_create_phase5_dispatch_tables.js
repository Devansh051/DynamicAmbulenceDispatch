import sequelize from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Migration 005: Create Phase 5 Dispatch Engine & Emergency Response Tables & Constraints
 * Non-destructive: Strictly checks sys.columns, sys.indexes, and OBJECT_ID before creating/altering.
 * Preserves all existing Phase 1-4 data, C++ compatibility, and SQL Server tables.
 */
export async function up() {
  logger.info('Running migration 005_create_phase5_dispatch_tables: UP...');

  // 1. Update status CHECK constraint on dbo.Emergencies to support full Phase 5 response lifecycle
  await sequelize.query(`
    IF EXISTS (
      SELECT 1 FROM sys.check_constraints 
      WHERE name = N'CK_Emergencies_Status' 
      AND parent_object_id = OBJECT_ID(N'dbo.Emergencies')
    )
    BEGIN
      ALTER TABLE dbo.Emergencies DROP CONSTRAINT CK_Emergencies_Status;
    END

    ALTER TABLE dbo.Emergencies ADD CONSTRAINT CK_Emergencies_Status CHECK (status IN (
      'REPORTED',
      'VERIFIED',
      'DISPATCH_RECOMMENDED',
      'DISPATCHED',
      'EN_ROUTE',
      'AT_PATIENT',
      'TRANSPORTING',
      'AT_HOSPITAL',
      'RESOLVED',
      'CLOSED',
      'CANCELLED'
    ));
  `);

  // 2. Add Phase 5 escalation, override, and recommendation link columns to dbo.Emergencies
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'escalated_at')
    BEGIN
      ALTER TABLE dbo.Emergencies ADD escalated_at DATETIME2 NULL;
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'escalation_reason')
    BEGIN
      ALTER TABLE dbo.Emergencies ADD escalation_reason NVARCHAR(500) NULL;
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'override_reason')
    BEGIN
      ALTER TABLE dbo.Emergencies ADD override_reason NVARCHAR(500) NULL;
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'override_dispatcher_id')
    BEGIN
      ALTER TABLE dbo.Emergencies ADD override_dispatcher_id INT NULL
        CONSTRAINT FK_Emergencies_OverrideDispatcher REFERENCES dbo.Users(id);
    END

    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'current_recommendation_id')
    BEGIN
      ALTER TABLE dbo.Emergencies ADD current_recommendation_id INT NULL;
    END
  `);

  // 3. Filtered Unique Index to prevent conflicting active assignments at the database engine level
  await sequelize.query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes 
      WHERE name = N'UQ_Emergencies_ActiveAmbulance' 
      AND object_id = OBJECT_ID(N'dbo.Emergencies')
    )
    BEGIN
      CREATE UNIQUE INDEX UQ_Emergencies_ActiveAmbulance ON dbo.Emergencies(assigned_ambulance_id)
      WHERE assigned_ambulance_id IS NOT NULL 
      AND status IN (
        'DISPATCH_RECOMMENDED',
        'DISPATCHED',
        'EN_ROUTE',
        'AT_PATIENT',
        'TRANSPORTING',
        'AT_HOSPITAL'
      );
    END
  `);

  // 4. Create dbo.DispatchRecommendations table
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.DispatchRecommendations', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.DispatchRecommendations (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DispatchRecommendations PRIMARY KEY,
        recommendation_uuid VARCHAR(50) NOT NULL CONSTRAINT UQ_DispatchRec_UUID UNIQUE,
        emergency_id INT NOT NULL,
        generated_by_user_id INT NULL,
        scoring_weights_json NVARCHAR(1000) NOT NULL,
        recommended_ambulance_id INT NULL,
        recommended_hospital_id INT NULL,
        candidates_json NVARCHAR(MAX) NOT NULL,
        exclusions_json NVARCHAR(MAX) NOT NULL,
        expires_at DATETIME2 NOT NULL,
        is_active BIT NOT NULL CONSTRAINT DF_DispatchRec_Active DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_DispatchRec_CreatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_DispatchRec_Emergency FOREIGN KEY (emergency_id) REFERENCES dbo.Emergencies(id) ON DELETE CASCADE,
        CONSTRAINT FK_DispatchRec_User FOREIGN KEY (generated_by_user_id) REFERENCES dbo.Users(id),
        CONSTRAINT FK_DispatchRec_Ambulance FOREIGN KEY (recommended_ambulance_id) REFERENCES dbo.Ambulances(AmbulanceID),
        CONSTRAINT FK_DispatchRec_Hospital FOREIGN KEY (recommended_hospital_id) REFERENCES dbo.Hospitals(HospitalID)
      );

      CREATE INDEX IX_DispatchRec_Emergency ON dbo.DispatchRecommendations(emergency_id);
      CREATE INDEX IX_DispatchRec_ExpiresAt ON dbo.DispatchRecommendations(expires_at);
      PRINT 'Created table dbo.DispatchRecommendations';
    END
  `);

  // 5. Create dbo.EmergencyEvents table (append-only timeline history)
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.EmergencyEvents', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.EmergencyEvents (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_EmergencyEvents PRIMARY KEY,
        emergency_id INT NOT NULL,
        user_id INT NULL,
        event_type VARCHAR(50) NOT NULL,
        from_status VARCHAR(30) NULL,
        to_status VARCHAR(30) NULL,
        ambulance_id INT NULL,
        hospital_id INT NULL,
        notes NVARCHAR(1000) NULL,
        details_json NVARCHAR(MAX) NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_EmergencyEvents_CreatedAt DEFAULT GETDATE(),
        CONSTRAINT FK_EmergencyEvents_Emergency FOREIGN KEY (emergency_id) REFERENCES dbo.Emergencies(id) ON DELETE CASCADE,
        CONSTRAINT FK_EmergencyEvents_User FOREIGN KEY (user_id) REFERENCES dbo.Users(id),
        CONSTRAINT FK_EmergencyEvents_Ambulance FOREIGN KEY (ambulance_id) REFERENCES dbo.Ambulances(AmbulanceID)
      );

      CREATE INDEX IX_EmergencyEvents_Emergency ON dbo.EmergencyEvents(emergency_id);
      CREATE INDEX IX_EmergencyEvents_CreatedAt ON dbo.EmergencyEvents(created_at DESC);
      PRINT 'Created table dbo.EmergencyEvents';
    END
  `);

  // 6. Create dbo.IdempotencyRecords table (duplicate-action protection)
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.IdempotencyRecords', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.IdempotencyRecords (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_IdempotencyRecords PRIMARY KEY,
        idempotency_key VARCHAR(100) NOT NULL CONSTRAINT UQ_Idempotency_Key UNIQUE,
        user_id INT NULL,
        request_path VARCHAR(255) NOT NULL,
        request_params_hash VARCHAR(64) NOT NULL,
        response_status INT NOT NULL,
        response_body NVARCHAR(MAX) NOT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_Idempotency_CreatedAt DEFAULT GETDATE(),
        expires_at DATETIME2 NOT NULL
      );

      CREATE INDEX IX_Idempotency_ExpiresAt ON dbo.IdempotencyRecords(expires_at);
      PRINT 'Created table dbo.IdempotencyRecords';
    END
  `);

  logger.info('✅ Migration 005_create_phase5_dispatch_tables: UP completed successfully.');
}

export async function down() {
  logger.info('Rolling back migration 005_create_phase5_dispatch_tables: DOWN...');

  await sequelize.query(`
    IF OBJECT_ID(N'dbo.IdempotencyRecords', N'U') IS NOT NULL
      DROP TABLE dbo.IdempotencyRecords;

    IF OBJECT_ID(N'dbo.EmergencyEvents', N'U') IS NOT NULL
      DROP TABLE dbo.EmergencyEvents;

    IF OBJECT_ID(N'dbo.DispatchRecommendations', N'U') IS NOT NULL
      DROP TABLE dbo.DispatchRecommendations;

    IF EXISTS (
      SELECT 1 FROM sys.indexes 
      WHERE name = N'UQ_Emergencies_ActiveAmbulance' 
      AND object_id = OBJECT_ID(N'dbo.Emergencies')
    )
      DROP INDEX UQ_Emergencies_ActiveAmbulance ON dbo.Emergencies;

    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'current_recommendation_id')
      ALTER TABLE dbo.Emergencies DROP COLUMN current_recommendation_id;

    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'override_dispatcher_id')
    BEGIN
      ALTER TABLE dbo.Emergencies DROP CONSTRAINT FK_Emergencies_OverrideDispatcher;
      ALTER TABLE dbo.Emergencies DROP COLUMN override_dispatcher_id;
    END

    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'override_reason')
      ALTER TABLE dbo.Emergencies DROP COLUMN override_reason;

    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'escalation_reason')
      ALTER TABLE dbo.Emergencies DROP COLUMN escalation_reason;

    IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Emergencies') AND name = N'escalated_at')
      ALTER TABLE dbo.Emergencies DROP COLUMN escalated_at;
  `);

  logger.info('✅ Migration 005_create_phase5_dispatch_tables: DOWN completed.');
}

export default { up, down };
