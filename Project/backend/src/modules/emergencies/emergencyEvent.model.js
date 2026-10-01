import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const EMERGENCY_EVENT_TYPES = Object.freeze({
  CREATED: 'CREATED',
  STATUS_CHANGE: 'STATUS_CHANGE',
  RECOMMENDATION_GENERATED: 'RECOMMENDATION_GENERATED',
  RECOMMENDATION_RECALCULATED: 'RECOMMENDATION_RECALCULATED',
  ASSIGNED: 'ASSIGNED',
  OVERRIDE_ASSIGNED: 'OVERRIDE_ASSIGNED',
  REASSIGNED: 'REASSIGNED',
  AMBULANCE_RELEASED: 'AMBULANCE_RELEASED',
  HOSPITAL_SELECTED: 'HOSPITAL_SELECTED',
  ESCALATED: 'ESCALATED',
  CANCELLED: 'CANCELLED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  NOTE_ADDED: 'NOTE_ADDED'
});

export const EmergencyEvent = sequelize.define('EmergencyEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  emergency_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  event_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  from_status: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  to_status: {
    type: DataTypes.STRING(30),
    allowNull: true
  },
  ambulance_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  hospital_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },
  details_json: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'EmergencyEvents',
  schema: 'dbo',
  timestamps: false
});

export default EmergencyEvent;
