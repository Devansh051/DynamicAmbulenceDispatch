import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const DispatchRecommendation = sequelize.define('DispatchRecommendation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  recommendation_uuid: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  emergency_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  generated_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  scoring_weights_json: {
    type: DataTypes.STRING(1000),
    allowNull: false
  },
  recommended_ambulance_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  recommended_hospital_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  candidates_json: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  exclusions_json: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false
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
  }
}, {
  tableName: 'DispatchRecommendations',
  schema: 'dbo',
  timestamps: false
});

export default DispatchRecommendation;
