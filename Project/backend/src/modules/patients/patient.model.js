import { DataTypes } from 'sequelize';
import sequelize from '../../config/database.js';

export const Patient = sequelize.define('Patient', {
  PatientID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false
  },
  Name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  Age: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  BloodGroup: {
    type: DataTypes.STRING(5),
    allowNull: false
  },
  Gender: {
    type: DataTypes.CHAR(1),
    allowNull: true
  },
  Address: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  Condition: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  VaccinesDone: {
    type: DataTypes.CHAR(1),
    allowNull: false
  },
  AreaOfTreatment: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  Insurance: {
    type: DataTypes.STRING(5),
    allowNull: false
  },
  PhoneNumber: {
    type: DataTypes.STRING(15),
    allowNull: false
  },
  HospitalAssignedID: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  OptimalCost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  Severity: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  CurrentTreatmentCost: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },
  TotalExpenditure: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  }
}, {
  tableName: 'Patients',
  schema: 'dbo',
  timestamps: false
});

export default Patient;
