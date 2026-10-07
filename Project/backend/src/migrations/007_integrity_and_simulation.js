import sequelize from '../config/database.js';

export async function up() {
  await sequelize.query(
    `IF COL_LENGTH('dbo.Emergencies', 'version') IS NULL
      ALTER TABLE dbo.Emergencies ADD version INT NOT NULL CONSTRAINT DF_Emergencies_Version DEFAULT 0;
    IF COL_LENGTH('dbo.Emergencies', 'is_simulated') IS NULL
      ALTER TABLE dbo.Emergencies ADD is_simulated BIT NOT NULL CONSTRAINT DF_Emergencies_Simulated DEFAULT 0;
    IF COL_LENGTH('dbo.Ambulances', 'telemetry_checkpoint_at') IS NULL
      ALTER TABLE dbo.Ambulances ADD telemetry_checkpoint_at DATETIME2 NULL;
    IF OBJECT_ID('dbo.AmbulanceIdSequence', 'SO') IS NULL
    BEGIN
      DECLARE @ambulanceStart INT = (SELECT ISNULL(MAX(AmbulanceID), 0) + 1 FROM dbo.Ambulances);
      EXEC('CREATE SEQUENCE dbo.AmbulanceIdSequence AS INT START WITH ' + @ambulanceStart + ' INCREMENT BY 1');
    END
    IF OBJECT_ID('dbo.HospitalIdSequence', 'SO') IS NULL
    BEGIN
      DECLARE @hospitalStart INT = (SELECT ISNULL(MAX(HospitalID), 0) + 1 FROM dbo.Hospitals);
      EXEC('CREATE SEQUENCE dbo.HospitalIdSequence AS INT START WITH ' + @hospitalStart + ' INCREMENT BY 1');
    END
    IF OBJECT_ID('dbo.FleetDispatchOutbox', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.FleetDispatchOutbox (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        event_id VARCHAR(100) NOT NULL UNIQUE,
        ambulance_id INT NOT NULL REFERENCES dbo.Ambulances(AmbulanceID),
        operational_status VARCHAR(40) NOT NULL,
        assignment_id INT NULL,
        is_simulated BIT NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        delivered_at DATETIME2 NULL
      );
      CREATE INDEX IX_FleetDispatchOutbox_Pending ON dbo.FleetDispatchOutbox(delivered_at, id);
    END`
  );
}

export async function down() {
  throw new Error('Migration 007 is additive; automatic destructive rollback is disabled.');
}
