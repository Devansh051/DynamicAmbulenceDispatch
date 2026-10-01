import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const AuthAuditLog = sequelize.define('AuthAuditLog', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  event_type: {
    type: DataTypes.STRING(60),
    allowNull: false
  },
  details: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  user_agent: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'AuthAuditLogs',
  schema: 'dbo',
  timestamps: false
});

export default AuthAuditLog;
