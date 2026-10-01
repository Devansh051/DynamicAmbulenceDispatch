import sequelize from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Migration 002: Create Phase 3 Core Data Management Tables & Columns
 * Non-destructive: Strictly checks sys.columns and OBJECT_ID before creating/altering.
 * Preserves all existing legacy data:
 * - 15 seeded Hospitals (HospitalID 1..15, HospitalName, Location)
 * - 20 seeded Ambulances (AmbulanceID 1..20, CurrentHospitalID, Status, Fuel)
 * - 225 HospitalRoutes entries
 * - Existing Patients, HospitalFeedback, AmbulanceTimeline records
 */
export async function up() {
  logger.info('Running migration 002_create_phase3_tables: UP...');

  // 1. Alter dbo.Ambulances to add Phase 3 fields if they do not exist
  await sequelize.query(`
    -- Add fleet_code
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'fleet_code')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD fleet_code VARCHAR(30) NULL;
    END

    -- Add vehicle_type
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'vehicle_type')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD vehicle_type VARCHAR(30) NOT NULL CONSTRAINT DF_Ambulances_VehicleType DEFAULT 'ADVANCED_LIFE_SUPPORT';
    END

    -- Add registration_number
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'registration_number')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD registration_number VARCHAR(50) NULL;
    END

    -- Add current_location_lat
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'current_location_lat')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD current_location_lat DECIMAL(10, 7) NULL;
    END

    -- Add current_location_lng
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'current_location_lng')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD current_location_lng DECIMAL(10, 7) NULL;
    END

    -- Add is_active
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'is_active')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD is_active BIT NOT NULL CONSTRAINT DF_Ambulances_IsActive DEFAULT 1;
    END

    -- Add legacy_id
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'legacy_id')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD legacy_id INT NULL;
    END

    -- Add created_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'created_at')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD created_at DATETIME2 NOT NULL CONSTRAINT DF_Ambulances_CreatedAt DEFAULT GETDATE();
    END

    -- Add updated_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Ambulances') AND name = N'updated_at')
    BEGIN
      ALTER TABLE dbo.Ambulances ADD updated_at DATETIME2 NOT NULL CONSTRAINT DF_Ambulances_UpdatedAt DEFAULT GETDATE();
    END
  `);

  // Backfill legacy ambulance identifiers & fleet codes if empty
  await sequelize.query(`
    UPDATE dbo.Ambulances
    SET legacy_id = AmbulanceID
    WHERE legacy_id IS NULL;

    UPDATE dbo.Ambulances
    SET fleet_code = 'AMB-' + RIGHT('000' + CAST(AmbulanceID AS VARCHAR(10)), 3)
    WHERE fleet_code IS NULL;

    UPDATE dbo.Ambulances
    SET registration_number = 'KA-01-EMS-' + CAST(1000 + AmbulanceID AS VARCHAR(10))
    WHERE registration_number IS NULL;
  `);

  // Indexes on dbo.Ambulances
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_Ambulances_FleetCode' AND object_id = OBJECT_ID(N'dbo.Ambulances'))
      CREATE UNIQUE INDEX UQ_Ambulances_FleetCode ON dbo.Ambulances(fleet_code) WHERE fleet_code IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_Ambulances_RegistrationNumber' AND object_id = OBJECT_ID(N'dbo.Ambulances'))
      CREATE UNIQUE INDEX UQ_Ambulances_RegistrationNumber ON dbo.Ambulances(registration_number) WHERE registration_number IS NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Ambulances_IsActive' AND object_id = OBJECT_ID(N'dbo.Ambulances'))
      CREATE INDEX IX_Ambulances_IsActive ON dbo.Ambulances(is_active);
  `);

  // 2. Alter dbo.Hospitals to add Phase 3 fields if they do not exist
  await sequelize.query(`
    -- Add hfr_id
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'hfr_id')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD hfr_id VARCHAR(50) NULL;
    END

    -- Add google_place_id
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'google_place_id')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD google_place_id VARCHAR(100) NULL;
    END

    -- Add address
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'address')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD address VARCHAR(255) NULL;
    END

    -- Add city
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'city')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD city VARCHAR(100) NOT NULL CONSTRAINT DF_Hospitals_City DEFAULT 'Bengaluru';
    END

    -- Add state
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'state')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD state VARCHAR(100) NOT NULL CONSTRAINT DF_Hospitals_State DEFAULT 'Karnataka';
    END

    -- Add postal_code
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'postal_code')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD postal_code VARCHAR(20) NULL;
    END

    -- Add latitude
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'latitude')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD latitude DECIMAL(10, 7) NULL;
    END

    -- Add longitude
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'longitude')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD longitude DECIMAL(10, 7) NULL;
    END

    -- Add facility_type
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'facility_type')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD facility_type VARCHAR(50) NOT NULL CONSTRAINT DF_Hospitals_FacilityType DEFAULT 'GENERAL_HOSPITAL';
    END

    -- Add ownership
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'ownership')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD ownership VARCHAR(50) NOT NULL CONSTRAINT DF_Hospitals_Ownership DEFAULT 'PRIVATE';
    END

    -- Add phone
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'phone')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD phone VARCHAR(25) NULL;
    END

    -- Add is_active
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'is_active')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD is_active BIT NOT NULL CONSTRAINT DF_Hospitals_IsActive DEFAULT 1;
    END

    -- Add data_source
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'data_source')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD data_source VARCHAR(50) NOT NULL CONSTRAINT DF_Hospitals_DataSource DEFAULT 'LEGACY_SEED';
    END

    -- Add source_updated_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'source_updated_at')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD source_updated_at DATETIME2 NULL;
    END

    -- Add legacy_id
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'legacy_id')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD legacy_id INT NULL;
    END

    -- Add created_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'created_at')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD created_at DATETIME2 NOT NULL CONSTRAINT DF_Hospitals_CreatedAt DEFAULT GETDATE();
    END

    -- Add updated_at
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'dbo.Hospitals') AND name = N'updated_at')
    BEGIN
      ALTER TABLE dbo.Hospitals ADD updated_at DATETIME2 NOT NULL CONSTRAINT DF_Hospitals_UpdatedAt DEFAULT GETDATE();
    END
  `);

  // Backfill legacy hospitals identifiers & address
  await sequelize.query(`
    UPDATE dbo.Hospitals
    SET legacy_id = HospitalID
    WHERE legacy_id IS NULL;

    UPDATE dbo.Hospitals
    SET address = COALESCE(Location, 'Bengaluru, Karnataka')
    WHERE address IS NULL;
  `);

  // Indexes on dbo.Hospitals
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Hospitals_IsActive' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
      CREATE INDEX IX_Hospitals_IsActive ON dbo.Hospitals(is_active);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Hospitals_FacilityType' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
      CREATE INDEX IX_Hospitals_FacilityType ON dbo.Hospitals(facility_type);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'UQ_Hospitals_HfrId' AND object_id = OBJECT_ID(N'dbo.Hospitals'))
      CREATE UNIQUE INDEX UQ_Hospitals_HfrId ON dbo.Hospitals(hfr_id) WHERE hfr_id IS NOT NULL;
  `);

  // 3. Create dbo.Emergencies table
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.Emergencies', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Emergencies (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Emergencies PRIMARY KEY,
        incident_code VARCHAR(30) NOT NULL CONSTRAINT UQ_Emergencies_IncidentCode UNIQUE,
        patient_id INT NULL,
        reported_by_user_id INT NULL,
        emergency_type VARCHAR(50) NOT NULL,
        severity INT NOT NULL,
        description VARCHAR(1000) NULL,
        location_address VARCHAR(255) NOT NULL,
        latitude DECIMAL(10, 7) NULL,
        longitude DECIMAL(10, 7) NULL,
        status VARCHAR(30) NOT NULL CONSTRAINT DF_Emergencies_Status DEFAULT 'REPORTED',
        assigned_ambulance_id INT NULL,
        assigned_hospital_id INT NULL,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_Emergencies_CreatedAt DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_Emergencies_UpdatedAt DEFAULT GETDATE(),
        resolved_at DATETIME2 NULL,
        CONSTRAINT CK_Emergencies_Severity CHECK (severity BETWEEN 1 AND 5),
        CONSTRAINT CK_Emergencies_Status CHECK (status IN ('REPORTED', 'VERIFIED', 'CANCELLED', 'CLOSED', 'DISPATCHED', 'EN_ROUTE', 'RESOLVED')),
        CONSTRAINT FK_Emergencies_Patients FOREIGN KEY (patient_id) REFERENCES dbo.Patients(PatientID) ON DELETE SET NULL,
        CONSTRAINT FK_Emergencies_Users FOREIGN KEY (reported_by_user_id) REFERENCES dbo.Users(id) ON DELETE SET NULL,
        CONSTRAINT FK_Emergencies_Ambulances FOREIGN KEY (assigned_ambulance_id) REFERENCES dbo.Ambulances(AmbulanceID) ON DELETE SET NULL,
        CONSTRAINT FK_Emergencies_Hospitals FOREIGN KEY (assigned_hospital_id) REFERENCES dbo.Hospitals(HospitalID) ON DELETE SET NULL
      );
      PRINT 'Created table dbo.Emergencies';
    END
  `);

  // Indexes on Emergencies
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Emergencies_Status' AND object_id = OBJECT_ID(N'dbo.Emergencies'))
      CREATE INDEX IX_Emergencies_Status ON dbo.Emergencies(status);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Emergencies_Severity' AND object_id = OBJECT_ID(N'dbo.Emergencies'))
      CREATE INDEX IX_Emergencies_Severity ON dbo.Emergencies(severity);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Emergencies_EmergencyType' AND object_id = OBJECT_ID(N'dbo.Emergencies'))
      CREATE INDEX IX_Emergencies_EmergencyType ON dbo.Emergencies(emergency_type);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Emergencies_CreatedAt' AND object_id = OBJECT_ID(N'dbo.Emergencies'))
      CREATE INDEX IX_Emergencies_CreatedAt ON dbo.Emergencies(created_at);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Emergencies_PatientId' AND object_id = OBJECT_ID(N'dbo.Emergencies'))
      CREATE INDEX IX_Emergencies_PatientId ON dbo.Emergencies(patient_id);
  `);

  // 4. Create dbo.ServiceZones table
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.ServiceZones', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ServiceZones (
        id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ServiceZones PRIMARY KEY,
        zone_code VARCHAR(30) NOT NULL CONSTRAINT UQ_ServiceZones_ZoneCode UNIQUE,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(500) NULL,
        center_latitude DECIMAL(10, 7) NULL,
        center_longitude DECIMAL(10, 7) NULL,
        radius_km DECIMAL(6, 2) NULL,
        is_active BIT NOT NULL CONSTRAINT DF_ServiceZones_IsActive DEFAULT 1,
        created_at DATETIME2 NOT NULL CONSTRAINT DF_ServiceZones_CreatedAt DEFAULT GETDATE(),
        updated_at DATETIME2 NOT NULL CONSTRAINT DF_ServiceZones_UpdatedAt DEFAULT GETDATE()
      );
      PRINT 'Created table dbo.ServiceZones';
    END
  `);

  // Index on ServiceZones
  await sequelize.query(`
    IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_ServiceZones_IsActive' AND object_id = OBJECT_ID(N'dbo.ServiceZones'))
      CREATE INDEX IX_ServiceZones_IsActive ON dbo.ServiceZones(is_active);
  `);

  // Seed default Bengaluru EMS Service Zones if table is empty
  const [existingZones] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.ServiceZones');
  if (existingZones[0]?.count === 0) {
    logger.info('Seeding default Bengaluru EMS Service Zones...');
    await sequelize.query(`
      INSERT INTO dbo.ServiceZones (zone_code, name, description, center_latitude, center_longitude, radius_km, is_active)
      VALUES
        ('ZONE-NORTH', 'North Bengaluru EMS Sector', 'Covers Hebbal, Yelahanka, Sahakarnagar, Sanjaynagar trauma coverage area', 13.0358, 77.5970, 12.5, 1),
        ('ZONE-SOUTH', 'South Bengaluru EMS Sector', 'Covers Jayanagar, Bannerghatta Road, JP Nagar, BTM Layout hospital network', 12.9250, 77.5938, 15.0, 1),
        ('ZONE-CENTRAL', 'Central Metro EMS Hub', 'Covers Shantinagar, MG Road, Richmond Town, Corporation Circle critical response zone', 12.9600, 77.5950, 8.0, 1),
        ('ZONE-EAST', 'East Corridor EMS Sector', 'Covers Whitefield, Marathahalli, KR Puram, Indiranagar trauma route corridor', 12.9698, 77.7499, 14.0, 1),
        ('ZONE-WEST', 'West Urban EMS Sector', 'Covers Rajajinagar, Yeshwanthpur, Nagarbhavi, Kengeri suburban dispatch zone', 12.9900, 77.5500, 13.5, 1);
    `);
  }

  logger.info('Migration 002_create_phase3_tables: UP completed successfully.');
}

/**
 * Migration 002 Rollback: Down
 * Safely removes Phase 3 tables and added columns without touching legacy schema.
 */
export async function down() {
  logger.info('Running migration 002_create_phase3_tables: DOWN...');

  // Drop tables created in Phase 3
  await sequelize.query(`
    IF OBJECT_ID(N'dbo.Emergencies', N'U') IS NOT NULL
      DROP TABLE dbo.Emergencies;

    IF OBJECT_ID(N'dbo.ServiceZones', N'U') IS NOT NULL
      DROP TABLE dbo.ServiceZones;
  `);

  logger.info('Migration 002_create_phase3_tables: DOWN completed.');
}
