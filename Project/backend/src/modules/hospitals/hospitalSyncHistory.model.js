import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const SYNC_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  PARTIALLY_COMPLETED: 'partially_completed',
  FAILED: 'failed'
});

export const SYNC_TRIGGERS = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL'
});

export const HospitalSyncHistory = sequelize.define('HospitalSyncHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  sync_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  trigger_type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: SYNC_TRIGGERS.SCHEDULED
  },
  started_at: {
    type: DataTypes.DATE,
    allowNull: false
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  duration_ms: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: SYNC_STATUS.PENDING
  },
  total_fetched: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  records_inserted: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  records_updated: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  records_skipped: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  records_failed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  error_details: {
    type: DataTypes.TEXT,
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
  tableName: 'HospitalSyncHistory',
  schema: 'dbo',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default HospitalSyncHistory;
