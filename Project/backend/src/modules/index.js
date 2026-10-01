import sequelize from '../config/database.js';
import Hospital from './hospitals/hospital.model.js';
import HospitalRoute from './hospitals/hospitalRoute.model.js';
import HospitalFeedback from './hospitals/hospitalFeedback.model.js';
import Ambulance from './ambulances/ambulance.model.js';
import AmbulanceTimeline from './ambulances/ambulanceTimeline.model.js';
import Patient from './patients/patient.model.js';
import User from './users/user.model.js';
import UserAuthIdentity from './users/userIdentity.model.js';
import AuthAuditLog from './audit/audit.model.js';
import Emergency from './emergencies/emergency.model.js';
import ServiceZone from './zones/zone.model.js';
import HospitalSyncHistory from './hospitals/hospitalSyncHistory.model.js';
import DispatchRecommendation from './dispatch/dispatchRecommendation.model.js';
import EmergencyEvent from './emergencies/emergencyEvent.model.js';
import IdempotencyRecord from './dispatch/idempotency.model.js';

// Setup Associations based on SQL Foreign Keys

// Hospital <-> HospitalRoutes
Hospital.hasMany(HospitalRoute, { foreignKey: 'SourceHospitalID', as: 'outgoingRoutes' });
Hospital.hasMany(HospitalRoute, { foreignKey: 'DestinationHospitalID', as: 'incomingRoutes' });
HospitalRoute.belongsTo(Hospital, { foreignKey: 'SourceHospitalID', as: 'sourceHospital' });
HospitalRoute.belongsTo(Hospital, { foreignKey: 'DestinationHospitalID', as: 'destinationHospital' });

// Hospital <-> Ambulances
Hospital.hasMany(Ambulance, { foreignKey: 'CurrentHospitalID', as: 'stationedAmbulances' });
Ambulance.belongsTo(Hospital, { foreignKey: 'CurrentHospitalID', as: 'currentHospital' });

// Hospital <-> Feedback
Hospital.hasMany(HospitalFeedback, { foreignKey: 'HospitalID', as: 'feedbacks' });
HospitalFeedback.belongsTo(Hospital, { foreignKey: 'HospitalID', as: 'hospital' });

// Hospital <-> Patients
Hospital.hasMany(Patient, { foreignKey: 'HospitalAssignedID', as: 'assignedPatients' });
Patient.belongsTo(Hospital, { foreignKey: 'HospitalAssignedID', as: 'assignedHospital' });

// Ambulance <-> Timeline
Ambulance.hasMany(AmbulanceTimeline, { foreignKey: 'AmbulanceID', as: 'timelineEvents' });
AmbulanceTimeline.belongsTo(Ambulance, { foreignKey: 'AmbulanceID', as: 'ambulance' });

// Phase 2: User <-> Identities & Audit
User.hasMany(UserAuthIdentity, { foreignKey: 'user_id', as: 'identities' });
UserAuthIdentity.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(AuthAuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
AuthAuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.belongsTo(User, { foreignKey: 'approved_by', as: 'approver' });

// Phase 3 & 5: Emergency Associations
Emergency.belongsTo(Patient, { foreignKey: 'patient_id', as: 'patient' });
Patient.hasMany(Emergency, { foreignKey: 'patient_id', as: 'emergencies' });

Emergency.belongsTo(User, { foreignKey: 'reported_by_user_id', as: 'reportedByUser' });
User.hasMany(Emergency, { foreignKey: 'reported_by_user_id', as: 'reportedEmergencies' });

Emergency.belongsTo(User, { foreignKey: 'override_dispatcher_id', as: 'overrideDispatcher' });

Emergency.belongsTo(Ambulance, { foreignKey: 'assigned_ambulance_id', as: 'assignedAmbulance' });
Ambulance.hasMany(Emergency, { foreignKey: 'assigned_ambulance_id', as: 'emergencies' });

Emergency.belongsTo(Hospital, { foreignKey: 'assigned_hospital_id', as: 'assignedHospital' });
Hospital.hasMany(Emergency, { foreignKey: 'assigned_hospital_id', as: 'emergencies' });

// Phase 5: Dispatch Recommendations & Events
Emergency.hasMany(DispatchRecommendation, { foreignKey: 'emergency_id', as: 'recommendations' });
DispatchRecommendation.belongsTo(Emergency, { foreignKey: 'emergency_id', as: 'emergency' });
DispatchRecommendation.belongsTo(User, { foreignKey: 'generated_by_user_id', as: 'generatedByUser' });
DispatchRecommendation.belongsTo(Ambulance, { foreignKey: 'recommended_ambulance_id', as: 'recommendedAmbulance' });
DispatchRecommendation.belongsTo(Hospital, { foreignKey: 'recommended_hospital_id', as: 'recommendedHospital' });

Emergency.hasMany(EmergencyEvent, { foreignKey: 'emergency_id', as: 'events' });
EmergencyEvent.belongsTo(Emergency, { foreignKey: 'emergency_id', as: 'emergency' });
EmergencyEvent.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
EmergencyEvent.belongsTo(Ambulance, { foreignKey: 'ambulance_id', as: 'ambulance' });

export {
  sequelize,
  Hospital,
  HospitalRoute,
  HospitalFeedback,
  Ambulance,
  AmbulanceTimeline,
  Patient,
  User,
  UserAuthIdentity,
  AuthAuditLog,
  Emergency,
  ServiceZone,
  HospitalSyncHistory,
  DispatchRecommendation,
  EmergencyEvent,
  IdempotencyRecord
};

export default {
  sequelize,
  Hospital,
  HospitalRoute,
  HospitalFeedback,
  Ambulance,
  AmbulanceTimeline,
  Patient,
  User,
  UserAuthIdentity,
  AuthAuditLog,
  Emergency,
  ServiceZone,
  HospitalSyncHistory,
  DispatchRecommendation,
  EmergencyEvent,
  IdempotencyRecord
};

