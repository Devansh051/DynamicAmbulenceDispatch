import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const HospitalRoute = sequelize.define('HospitalRoute', {
  SourceHospitalID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  DestinationHospitalID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  IsConnected: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  },
  Casualties: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  Weight: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'HospitalRoutes',
  schema: 'dbo',
  timestamps: false
});

export default HospitalRoute;
