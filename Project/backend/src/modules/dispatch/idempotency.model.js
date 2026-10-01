import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const IdempotencyRecord = sequelize.define('IdempotencyRecord', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  idempotency_key: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  request_path: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  request_params_hash: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  response_status: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  response_body: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'IdempotencyRecords',
  schema: 'dbo',
  timestamps: false
});

export default IdempotencyRecord;
