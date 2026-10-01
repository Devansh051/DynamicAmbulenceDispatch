import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const UserAuthIdentity = sequelize.define('UserAuthIdentity', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  provider_subject: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  provider_email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  provider_email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
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
  tableName: 'UserAuthIdentities',
  schema: 'dbo',
  timestamps: false
});

export default UserAuthIdentity;
