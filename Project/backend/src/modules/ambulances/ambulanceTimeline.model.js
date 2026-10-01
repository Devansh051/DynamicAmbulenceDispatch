import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const AmbulanceTimeline = sequelize.define('AmbulanceTimeline', {
  TimelineID: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  AmbulanceID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  EventTime: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  EventType: {
    type: DataTypes.STRING(40),
    allowNull: false
  },
  Message: {
    type: DataTypes.STRING(500),
    allowNull: false
  }
}, {
  tableName: 'AmbulanceTimeline',
  schema: 'dbo',
  timestamps: false
});

export default AmbulanceTimeline;
