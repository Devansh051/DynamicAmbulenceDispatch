import sequelize from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Adds Phase 5 live-fleet storage without altering or removing legacy data.
 * Current live state remains in Redis; these append-only tables are the
 * controlled SQL Server history and audit trail.
 */
export async function up() {
  logger.info('Running migration 006_create_fleet_tracking_tables: UP...');

  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'is_simulated')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD is_simulated BIT NOT NULL
        CONSTRAINT DF_Ambulances_IsSimulated DEFAULT 0;
    END

    IF OBJECT_ID(N'dbo.AmbulanceLocationHistory', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AmbulanceLocationHistory (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AmbulanceLocationHistory PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL CONSTRAINT UQ_AmbulanceLocationHistory_Event UNIQUE,
        ambulance_id INT NOT NULL,
        latitude DECIMAL(10,7) NOT NULL,
        longitude DECIMAL(10,7) NOT NULL,
        speed_kph DECIMAL(7,2) NULL,
        heading_degrees DECIMAL(6,2) NULL,
        operational_status VARCHAR(40) NOT NULL,
        assignment_id INT NULL,
        gps_event_timestamp DATETIME2 NOT NULL,
        server_received_at DATETIME2 NOT NULL,
        is_simulated BIT NOT NULL CONSTRAINT DF_AmbulanceLocationHistory_IsSimulated DEFAULT 0,
        source_id VARCHAR(100) NULL,
        CONSTRAINT FK_AmbulanceLocationHistory_Ambulance FOREIGN KEY (ambulance_id) REFERENCES dbo.Ambulances(AmbulanceID)
      );
      CREATE INDEX IX_AmbulanceLocationHistory_Ambulance_Time
        ON dbo.AmbulanceLocationHistory(ambulance_id, gps_event_timestamp DESC);
      CREATE INDEX IX_AmbulanceLocationHistory_ReceivedAt
        ON dbo.AmbulanceLocationHistory(server_received_at DESC);
    END

    IF OBJECT_ID(N'dbo.AmbulanceOperationalEvents', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AmbulanceOperationalEvents (
        id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AmbulanceOperationalEvents PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL CONSTRAINT UQ_AmbulanceOperationalEvents_Event UNIQUE,
        ambulance_id INT NOT NULL,
        from_status VARCHAR(40) NULL,
        to_status VARCHAR(40) NOT NULL,
        assignment_id INT NULL,
        gps_event_timestamp DATETIME2 NOT NULL,
        server_received_at DATETIME2 NOT NULL,
        is_simulated BIT NOT NULL CONSTRAINT DF_AmbulanceOperationalEvents_IsSimulated DEFAULT 0,
        source_id VARCHAR(100) NULL,
        details_json NVARCHAR(MAX) NULL,
        CONSTRAINT FK_AmbulanceOperationalEvents_Ambulance FOREIGN KEY (ambulance_id) REFERENCES dbo.Ambulances(AmbulanceID)
      );
      CREATE INDEX IX_AmbulanceOperationalEvents_Ambulance_Time
        ON dbo.AmbulanceOperationalEvents(ambulance_id, gps_event_timestamp DESC);
    END
  `);

  logger.info('Migration 006_create_fleet_tracking_tables: UP completed.');
}

export async function down() {
  logger.warn('Migration 006 is intentionally non-destructive; no automatic rollback is provided for fleet history.');
}

export default { up, down };
