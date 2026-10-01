import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const USER_ROLES = {
  ADMIN: 'ADMIN',
  DISPATCHER: 'DISPATCHER',
  AMBULANCE_CREW: 'AMBULANCE_CREW',
  HOSPITAL_OPERATOR: 'HOSPITAL_OPERATOR'
};

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED'
};

export const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  role: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: USER_ROLES.DISPATCHER,
    validate: {
      isIn: [Object.values(USER_ROLES)]
    }
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: USER_STATUS.PENDING,
    validate: {
      isIn: [Object.values(USER_STATUS)]
    }
  },
  email_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  must_change_password: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  approved_by: {
    type: DataTypes.INTEGER,
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
  tableName: 'Users',
  schema: 'dbo',
  timestamps: false
});

/**
 * Returns safe user representation without sensitive fields (password_hash)
 */
User.prototype.toSafeObject = function (linkedIdentities = []) {
  const safe = {
    id: this.id,
    email: this.email,
    name: this.name,
    role: this.role,
    status: this.status,
    email_verified: Boolean(this.email_verified),
    must_change_password: Boolean(this.must_change_password),
    has_local_password: Boolean(this.password_hash),
    approved_at: this.approved_at,
    approved_by: this.approved_by,
    created_at: this.created_at,
    updated_at: this.updated_at,
    linked_providers: linkedIdentities.map(id => ({
      provider: id.provider,
      provider_email: id.provider_email,
      created_at: id.created_at
    }))
  };
  return safe;
};

export default User;
