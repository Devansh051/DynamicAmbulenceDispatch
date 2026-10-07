import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const AMBULANCE_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
  MAINTENANCE: 'MAINTENANCE'
});

export const normalizeAmbulanceStatus = (status) => {
  if (!status) return AMBULANCE_STATUS.AVAILABLE;
  const s = String(status).trim().toUpperCase();
  if (s === 'AVAILABLE') return AMBULANCE_STATUS.AVAILABLE;
  if (s === 'BUSY') return AMBULANCE_STATUS.BUSY;
  if (s === 'OUT_OF_SERVICE' || s === 'OUT OF SERVICE') return AMBULANCE_STATUS.OUT_OF_SERVICE;
  if (s === 'MAINTENANCE') return AMBULANCE_STATUS.MAINTENANCE;
  return s;
};

export const toDatabaseAmbulanceStatus = (status) => {
  const norm = normalizeAmbulanceStatus(status);
  return norm.toLowerCase(); // 'available', 'busy', 'out_of_service', 'maintenance'
};

export const isAmbulanceAvailable = (status) => {
  if (!status) return false;
  return normalizeAmbulanceStatus(status) === AMBULANCE_STATUS.AVAILABLE;
};

export const VEHICLE_TYPES = Object.freeze({
  BASIC_LIFE_SUPPORT: 'BASIC_LIFE_SUPPORT',
  ADVANCED_LIFE_SUPPORT: 'ADVANCED_LIFE_SUPPORT',
  PATIENT_TRANSPORT: 'PATIENT_TRANSPORT',
  NEONATAL: 'NEONATAL'
});

export const Ambulance = sequelize.define('Ambulance', {
  AmbulanceID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  CurrentHospitalID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  Status: {
    type: DataTypes.STRING(16),
    allowNull: false,
    defaultValue: 'available'
  },
  Fuel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    validate: {
      min: 0,
      max: 100
    }
  },
  fleet_code: {
    type: DataTypes.STRING(30),
    allowNull: true,
    unique: true
  },
  vehicle_type: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: VEHICLE_TYPES.ADVANCED_LIFE_SUPPORT
  },
  registration_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  current_location_lat: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    validate: {
      min: -90,
      max: 90
    }
  },
  current_location_lng: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    validate: {
      min: -180,
      max: 180
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  is_simulated: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
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
  tableName: 'Ambulances',
  schema: 'dbo',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeValidate: async (ambulance) => {
      if (!ambulance.AmbulanceID) {
        const [result] = await sequelize.query('SELECT NEXT VALUE FOR dbo.AmbulanceIdSequence AS nextId');
        ambulance.AmbulanceID = result[0]?.nextId || 1;
      }
      if (!ambulance.legacy_id) {
        ambulance.legacy_id = ambulance.AmbulanceID;
      }
      if (!ambulance.fleet_code) {
        ambulance.fleet_code = `AMB-${String(ambulance.AmbulanceID).padStart(3, '0')}`;
      }
    }
  }
});

// Virtual helpers / aliases for consistent JavaScript access
Object.defineProperty(Ambulance.prototype, 'id', {
  get() { return this.AmbulanceID; }
});
Object.defineProperty(Ambulance.prototype, 'fuel_level', {
  get() { return this.Fuel; }
});
Object.defineProperty(Ambulance.prototype, 'current_hospital_id', {
  get() { return this.CurrentHospitalID; }
});
Object.defineProperty(Ambulance.prototype, 'status', {
  get() { return normalizeAmbulanceStatus(this.Status); }
});
Object.defineProperty(Ambulance.prototype, 'status_normalized', {
  get() { return normalizeAmbulanceStatus(this.Status); }
});
Object.defineProperty(Ambulance.prototype, 'is_available', {
  get() { return isAmbulanceAvailable(this.Status); }
});

export default Ambulance;
