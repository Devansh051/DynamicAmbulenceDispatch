import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const FACILITY_TYPES = Object.freeze({
  GENERAL_HOSPITAL: 'GENERAL_HOSPITAL',
  TRAUMA_CENTER: 'TRAUMA_CENTER',
  SPECIALTY_CLINIC: 'SPECIALTY_CLINIC',
  TERTIARY_CARE: 'TERTIARY_CARE'
});

export const OWNERSHIP_TYPES = Object.freeze({
  PRIVATE: 'PRIVATE',
  PUBLIC: 'PUBLIC',
  TRUST: 'TRUST'
});

export const DATA_SOURCES = Object.freeze({
  LEGACY_SEED: 'LEGACY_SEED',
  MANUAL: 'MANUAL',
  GOV_DIRECTORY: 'GOV_DIRECTORY',
  GOOGLE_PLACES: 'GOOGLE_PLACES',
  MATCHED_BOTH: 'MATCHED_BOTH'
});

export const VERIFICATION_STATUSES = Object.freeze({
  UNVERIFIED: 'UNVERIFIED',
  VERIFIED: 'VERIFIED',
  CROSS_MATCHED: 'CROSS_MATCHED'
});

export const DATA_FRESHNESS = Object.freeze({
  FRESH: 'FRESH',
  OUTDATED: 'OUTDATED',
  UNKNOWN: 'UNKNOWN'
});

export const Hospital = sequelize.define('Hospital', {
  HospitalID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  HospitalName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  Location: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  government_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  hfr_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  google_place_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  address: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Bengaluru'
  },
  district: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'Karnataka'
  },
  postal_code: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    validate: {
      min: -90,
      max: 90
    }
  },
  longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    validate: {
      min: -180,
      max: 180
    }
  },
  facility_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: FACILITY_TYPES.GENERAL_HOSPITAL
  },
  ownership: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: OWNERSHIP_TYPES.PRIVATE
  },
  phone: {
    type: DataTypes.STRING(25),
    allowNull: true
  },
  specialties: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  emergency_services: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  verification_status: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: VERIFICATION_STATUSES.UNVERIFIED
  },
  data_freshness: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: DATA_FRESHNESS.FRESH
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  data_source: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: DATA_SOURCES.MANUAL
  },
  source_updated_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_imported_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  legacy_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'Hospitals',
  schema: 'dbo',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeValidate: async (hospital) => {
      if (!hospital.HospitalID) {
        const [result] = await sequelize.query('SELECT NEXT VALUE FOR dbo.HospitalIdSequence AS nextId');
        hospital.HospitalID = result[0]?.nextId || 1;
      }
      if (!hospital.legacy_id) {
        hospital.legacy_id = hospital.HospitalID;
      }
      if (!hospital.Location && hospital.address) {
        hospital.Location = hospital.address.substring(0, 100);
      }
    }
  }
});

// Virtual helpers / aliases for clean JavaScript access
Object.defineProperty(Hospital.prototype, 'id', {
  get() { return this.HospitalID; }
});
Object.defineProperty(Hospital.prototype, 'name', {
  get() { return this.HospitalName; }
});

export default Hospital;
