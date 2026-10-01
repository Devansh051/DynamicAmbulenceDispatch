import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const ServiceZone = sequelize.define('ServiceZone', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  zone_code: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  center_latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    validate: {
      min: -90,
      max: 90
    }
  },
  center_longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
    validate: {
      min: -180,
      max: 180
    }
  },
  radius_km: {
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
    validate: {
      min: 0.1,
      max: 500
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
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
  tableName: 'ServiceZones',
  schema: 'dbo',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default ServiceZone;
