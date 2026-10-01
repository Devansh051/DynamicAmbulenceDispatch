import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const EMERGENCY_STATUS = Object.freeze({
  REPORTED: 'REPORTED',
  VERIFIED: 'VERIFIED',
  DISPATCH_RECOMMENDED: 'DISPATCH_RECOMMENDED',
  DISPATCHED: 'DISPATCHED',
  EN_ROUTE: 'EN_ROUTE',
  AT_PATIENT: 'AT_PATIENT',
  TRANSPORTING: 'TRANSPORTING',
  AT_HOSPITAL: 'AT_HOSPITAL',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED'
});

export const EMERGENCY_TYPES = Object.freeze({
  CARDIAC: 'CARDIAC',
  TRAUMA: 'TRAUMA',
  RESPIRATORY: 'RESPIRATORY',
  STROKE: 'STROKE',
  ACCIDENT: 'ACCIDENT',
  OTHER: 'OTHER'
});

export const SEVERITY_LEVELS = Object.freeze({
  1: { level: 1, label: 'Low (Non-Emergency)', description: 'Minor injury or stable condition' },
  2: { level: 2, label: 'Guarded (Minor/Urgent)', description: 'Requires standard evaluation without immediate danger' },
  3: { level: 3, label: 'Serious (Urgent)', description: 'Severe distress, rapid progression potential' },
  4: { level: 4, label: 'Severe (Immediate)', description: 'Life-threatening condition requiring urgent intervention' },
  5: { level: 5, label: 'Critical (Resuscitation)', description: 'Immediately life-threatening, cardiopulmonary failure' }
});

export const Emergency = sequelize.define('Emergency', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  incident_code: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true
  },
  patient_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  reported_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  emergency_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: EMERGENCY_TYPES.OTHER
  },
  severity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    validate: {
      min: 1,
      max: 5
    }
  },
  description: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },
  location_address: {
    type: DataTypes.STRING(255),
    allowNull: false
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
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: EMERGENCY_STATUS.REPORTED
  },
  assigned_ambulance_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  assigned_hospital_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  current_recommendation_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  override_dispatcher_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  override_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  escalated_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  escalation_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  resolved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  resolution_notes: {
    type: DataTypes.STRING(1000),
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
  tableName: 'Emergencies',
  schema: 'dbo',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeValidate: (emergency) => {
      if (!emergency.incident_code) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const randomHex = Math.floor(1000 + Math.random() * 9000);
        emergency.incident_code = `EMG-${dateStr}-${randomHex}`;
      }
    }
  }
});

export default Emergency;
