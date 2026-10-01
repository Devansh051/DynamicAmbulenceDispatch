import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const HospitalFeedback = sequelize.define('HospitalFeedback', {
  FeedbackID: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  HospitalID: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  Rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 5
    }
  },
  FeedbackText: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  CreatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'HospitalFeedback',
  schema: 'dbo',
  timestamps: false
});

export default HospitalFeedback;
