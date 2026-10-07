import { Op } from 'sequelize';
import Emergency, { EMERGENCY_STATUS, EMERGENCY_TYPES } from './emergency.model.js';
import Patient from '../patients/patient.model.js';
import User from '../users/user.model.js';
import Ambulance, { isAmbulanceAvailable, toDatabaseAmbulanceStatus } from '../ambulances/ambulance.model.js';
import AmbulanceTimeline from '../ambulances/ambulanceTimeline.model.js';
import Hospital, { DATA_SOURCES } from '../hospitals/hospital.model.js';
import hospitalService from '../hospitals/hospital.service.js';
import auditService, { recordAuditEvent, AUDIT_EVENTS } from '../audit/audit.service.js';
import googleMapsService from '../hospitals/googleMaps.service.js';
import otpService from '../otp/otp.service.js';
import sequelize from '../../config/database.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import dispatchEngineService from '../dispatch/dispatchEngine.service.js';
import idempotencyService from '../dispatch/idempotency.service.js';
import DispatchRecommendation from '../dispatch/dispatchRecommendation.model.js';
import EmergencyEvent, { EMERGENCY_EVENT_TYPES } from './emergencyEvent.model.js';
import fleetTrackerService from '../fleet/fleetTracker.service.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';
import {
  LIFECYCLE_TRANSITIONS,
  isValidTransition,
  getNextAllowedTransitions,
  authorizeTransition,
  shouldReleaseAmbulance,
  isActiveResponseStatus
} from './emergencyLifecycle.js';

/**
 * Centralized Emergency Lifecycle State Machine (Re-exported for backwards compatibility)
 */
export const ALLOWED_STATUS_TRANSITIONS = LIFECYCLE_TRANSITIONS;

export const isValidEmergencyStatusTransition = (fromStatus, toStatus) => {
  return isValidTransition(fromStatus, toStatus);
};

export const getAllowedEmergencyTransitions = (fromStatus) => {
  return getNextAllowedTransitions(fromStatus);
};

const fleetStatusForEmergency = (status) => ({
  [EMERGENCY_STATUS.DISPATCHED]: 'ASSIGNED',
  [EMERGENCY_STATUS.EN_ROUTE]: 'EN_ROUTE_TO_SCENE',
  [EMERGENCY_STATUS.AT_PATIENT]: 'ARRIVED_AT_SCENE',
  [EMERGENCY_STATUS.TRANSPORTING]: 'TRANSPORTING',
  [EMERGENCY_STATUS.AT_HOSPITAL]: 'ARRIVED_AT_HOSPITAL',
  [EMERGENCY_STATUS.RESOLVED]: 'AVAILABLE',
  [EMERGENCY_STATUS.CLOSED]: 'AVAILABLE',
  [EMERGENCY_STATUS.CANCELLED]: 'AVAILABLE'
}[status] || 'ASSIGNED');

const syncFleetState = (payload) => {
  fleetTrackerService.syncOperationalState(payload).catch((error) => {
    logger.warn(`Fleet state synchronization deferred: ${error.message}`);
  });
};

class EmergencyService {
  async listEmergencies({
    page = 1,
    limit = 20,
    search = '',
    status,
    emergency_type,
    severity,
    sortBy = 'created_at',
    sortOrder = 'DESC'
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const where = {};

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { incident_code: { [Op.like]: q } },
        { location_address: { [Op.like]: q } },
        { description: { [Op.like]: q } }
      ];
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (emergency_type) {
      where.emergency_type = emergency_type.toUpperCase();
    }

    if (severity) {
      where.severity = parseInt(severity, 10);
    }

    const allowedSortFields = ['id', 'incident_code', 'severity', 'status', 'emergency_type', 'created_at', 'updated_at'];
    const orderColumn = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const orderDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await Emergency.findAndCountAll({
      where,
      include: [
        {
          model: Patient,
          as: 'patient',
          attributes: ['PatientID', 'Name', 'Age', 'BloodGroup', 'PhoneNumber', 'Condition', 'Severity']
        },
        {
          model: User,
          as: 'reportedByUser',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Ambulance,
          as: 'assignedAmbulance',
          attributes: ['AmbulanceID', 'fleet_code', 'Status', 'Fuel']
        },
        {
          model: Hospital,
          as: 'assignedHospital',
          attributes: ['HospitalID', 'HospitalName', 'Location']
        }
      ],
      order: [[orderColumn, orderDir]],
      limit: limitNum,
      offset
    });

    return {
      emergencies: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    };
  }

  async getEmergencyById(id, transaction = null) {
    const emergency = await Emergency.findByPk(id, {
      transaction,
      include: [
        {
          model: Patient,
          as: 'patient',
          attributes: ['PatientID', 'Name', 'Age', 'BloodGroup', 'PhoneNumber', 'Condition', 'AreaOfTreatment', 'Severity']
        },
        {
          model: User,
          as: 'reportedByUser',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Ambulance,
          as: 'assignedAmbulance',
          attributes: ['AmbulanceID', 'fleet_code', 'Status', 'Fuel']
        },
        {
          model: Hospital,
          as: 'assignedHospital',
          attributes: ['HospitalID', 'HospitalName', 'Location']
        }
      ]
    });

    if (!emergency) {
      const err = new Error(`Emergency incident with ID '${id}' not found`);
      err.status = 404;
      err.code = 'EMERGENCY_NOT_FOUND';
      throw err;
    }

    return emergency;
  }

  /**
   * Atomic emergency creation with transaction and audit logging
   */
  async createEmergency(data, user) {
    const {
      incident_code,
      patient_id,
      emergency_type = EMERGENCY_TYPES.OTHER,
      severity = 3,
      description,
      location_address,
      latitude,
      longitude
    } = data;

    // Check optional patient existence
    if (patient_id) {
      const patient = await Patient.findByPk(patient_id);
      if (!patient) {
        const err = new Error(`Patient with ID '${patient_id}' does not exist.`);
        err.status = 400;
        err.code = 'INVALID_PATIENT_REFERENCE';
        throw err;
      }
    }

    // Check duplicate incident_code if passed
    if (incident_code) {
      const existing = await Emergency.findOne({ where: { incident_code } });
      if (existing) {
        const err = new Error(`Incident code '${incident_code}' already exists.`);
        err.status = 409;
        err.code = 'DUPLICATE_INCIDENT_CODE';
        throw err;
      }
    }

    const transaction = await sequelize.transaction();
    try {
      const emergency = await Emergency.create({
        incident_code: incident_code || undefined,
        patient_id: patient_id || null,
        is_simulated: data.is_simulated === true,
        reported_by_user_id: user.id,
        emergency_type: emergency_type.toUpperCase(),
        severity: parseInt(severity, 10),
        description: description || null,
        location_address: location_address.trim(),
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        status: EMERGENCY_STATUS.REPORTED,
        assigned_ambulance_id: null,
        assigned_hospital_id: null
      }, { transaction });

      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user.id,
        event_type: EMERGENCY_EVENT_TYPES.CREATED,
        to_status: EMERGENCY_STATUS.REPORTED
      }, { transaction });

      // Atomic security audit record (sanitized, no sensitive patient data)
      await auditService.recordAuditEvent({
        userId: user.id,
        eventType: AUDIT_EVENTS.EMERGENCY_REPORTED,
        details: {
          action: 'CREATE_EMERGENCY',
          incident_code: emergency.incident_code,
          emergency_id: emergency.id,
          emergency_type: emergency.emergency_type,
          severity: emergency.severity,
          location_address: emergency.location_address,
          contact_phone: data.contact_phone || undefined,
          patient_name: data.patient_name || undefined,
          reported_by: user.name,
          actor_role: user.role
        },
        transaction
      });

      await transaction.commit();
      return this.getEmergencyById(emergency.id);
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Atomic emergency update with state machine validation and audit logging
   */
  async updateEmergency(id, data, user) {
    const emergency = await Emergency.findByPk(id);
    if (!emergency) {
      const err = new Error(`Emergency incident with ID '${id}' not found`);
      err.status = 404;
      err.code = 'EMERGENCY_NOT_FOUND';
      throw err;
    }

    const {
      emergency_type,
      severity,
      description,
      location_address,
      latitude,
      longitude,
      patient_id,
      status
    } = data;

    if (patient_id !== undefined && patient_id !== null) {
      const patient = await Patient.findByPk(patient_id);
      if (!patient) {
        const err = new Error(`Patient with ID '${patient_id}' does not exist.`);
        err.status = 400;
        err.code = 'INVALID_PATIENT_REFERENCE';
        throw err;
      }
    }

    if (status !== undefined && status !== emergency.status) {
      throw Object.assign(new Error('Use the incident status endpoint for lifecycle changes.'), { status: 400, code: 'USE_LIFECYCLE_ENDPOINT' });
    }

    // State machine transition validation
    if (status !== undefined) {
      const newStatus = status.toUpperCase();
      if (newStatus !== emergency.status && !isValidEmergencyStatusTransition(emergency.status, newStatus)) {
        const allowed = getAllowedEmergencyTransitions(emergency.status);
        const err = new Error(
          `Invalid status transition from '${emergency.status}' to '${newStatus}'. Permitted transitions: ${allowed.length ? allowed.join(', ') : 'None (Terminal state)'}`
        );
        err.status = 400;
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }
    }

    const transaction = await sequelize.transaction();
    try {
      if (patient_id !== undefined) emergency.patient_id = patient_id;
      if (emergency_type !== undefined) emergency.emergency_type = emergency_type.toUpperCase();
      if (severity !== undefined) emergency.severity = parseInt(severity, 10);
      if (description !== undefined) emergency.description = description;
      if (location_address !== undefined) emergency.location_address = location_address.trim();
      if (latitude !== undefined) emergency.latitude = latitude;
      if (longitude !== undefined) emergency.longitude = longitude;

      let prevStatus = emergency.status;
      if (status !== undefined) {
        const newStatus = status.toUpperCase();
        emergency.status = newStatus;
        if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(newStatus) && !emergency.resolved_at) {
          emergency.resolved_at = new Date();
        }
      }

      await emergency.save({ transaction });

      // Atomic audit logging
      await recordAuditEvent({
        userId: user.id,
        eventType: AUDIT_EVENTS.EMERGENCY_UPDATED,
        details: {
          action: 'UPDATE_EMERGENCY',
          incident_code: emergency.incident_code,
          emergency_id: emergency.id,
          previous_status: prevStatus,
          status: emergency.status,
          updated_by: user.name,
          actor_role: user.role
        },
        transaction
      });

      await transaction.commit();
      return this.getEmergencyById(emergency.id);
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Dedicated status update with state machine validation, dedicated resolution_notes field,
   * ambulance release on cancellation/resolution, and atomic audit logging
   */
  async updateEmergencyStatus(id, statusArg, maybeUserOrOptions, maybeUser) {
    let status;
    let resolution_notes;
    let user;

    if (typeof statusArg === 'object' && statusArg !== null) {
      status = statusArg.status;
      resolution_notes = statusArg.resolution_notes;
      user = maybeUserOrOptions;
    } else {
      status = statusArg;
      if (typeof maybeUserOrOptions === 'object' && maybeUserOrOptions !== null && 'resolution_notes' in maybeUserOrOptions) {
        resolution_notes = maybeUserOrOptions.resolution_notes;
        user = maybeUser;
      } else {
        user = maybeUserOrOptions;
      }
    }

    return this.updateResponseLifecycleStatus(id, { ...(typeof statusArg === 'object' ? statusArg : {}), status, resolution_notes }, user);
  }

  /**
   * Phase 4: Compute route-based recommendations for emergency dispatch
   * Distinguishes recommendations from confirmed assignments
   */
  async getDispatchRecommendations(id) {
    const emergency = await this.getEmergencyById(id);

    const emgLat = emergency.latitude !== null && emergency.latitude !== undefined ? parseFloat(emergency.latitude) : null;
    const emgLng = emergency.longitude !== null && emergency.longitude !== undefined ? parseFloat(emergency.longitude) : null;

    // 1. Find all fleet ambulances
    const allAmbulances = await Ambulance.findAll({
      where: { is_active: true },
      include: [
        {
          model: Hospital,
          as: 'currentHospital',
          attributes: ['HospitalID', 'HospitalName', 'Location', 'latitude', 'longitude']
        }
      ]
    });

    // 2. Identify currently active assignments to enforce single-assignment rule
    const activeEmergencies = await Emergency.findAll({
      where: {
        assigned_ambulance_id: { [Op.ne]: null },
        status: { [Op.in]: [EMERGENCY_STATUS.REPORTED, EMERGENCY_STATUS.VERIFIED, EMERGENCY_STATUS.DISPATCHED, EMERGENCY_STATUS.EN_ROUTE] },
        id: { [Op.ne]: emergency.id }
      },
      attributes: ['id', 'incident_code', 'assigned_ambulance_id']
    });

    const activeAssignedAmbIds = new Set(activeEmergencies.map(e => e.assigned_ambulance_id));

    // 3. Filter eligible ambulances
    const eligibleAmbulances = [];
    const disqualifiedAmbulances = [];

    for (const amb of allAmbulances) {
      const isAvailable = isAmbulanceAvailable(amb.Status);
      const isAssigned = activeAssignedAmbIds.has(amb.AmbulanceID);
      const hasFuel = (amb.Fuel || 0) >= 20; // 20% minimum fuel threshold

      if (isAvailable && !isAssigned && hasFuel) {
        // Resolve GPS location
        let ambLat = hasValidCoordinates(amb.current_location_lat, amb.current_location_lng) ? parseFloat(amb.current_location_lat) : null;
        let ambLng = hasValidCoordinates(amb.current_location_lat, amb.current_location_lng) ? parseFloat(amb.current_location_lng) : null;

        if (!hasValidCoordinates(ambLat, ambLng) && amb.currentHospital && hasValidCoordinates(amb.currentHospital.latitude, amb.currentHospital.longitude)) {
          ambLat = parseFloat(amb.currentHospital.latitude);
          ambLng = parseFloat(amb.currentHospital.longitude);
        }

        let routeEstimate = null;
        if (hasValidCoordinates(emgLat, emgLng) && hasValidCoordinates(ambLat, ambLng)) {
          routeEstimate = googleMapsService.calculateHaversineDistanceAndTime(
            { lat: ambLat, lng: ambLng },
            { lat: emgLat, lng: emgLng }
          );
        }

        eligibleAmbulances.push({
          AmbulanceID: amb.AmbulanceID,
          fleet_code: amb.fleet_code,
          Status: amb.Status,
          status_normalized: 'AVAILABLE',
          Fuel: amb.Fuel,
          vehicle_type: amb.vehicle_type,
          current_hospital_id: amb.CurrentHospitalID,
          current_hospital_name: amb.currentHospital?.HospitalName || null,
          latitude: ambLat,
          longitude: ambLng,
          estimated_distance_km: routeEstimate ? routeEstimate.distance_km : null,
          estimated_duration_minutes: routeEstimate ? routeEstimate.duration_minutes : null,
          formatted_duration: routeEstimate ? routeEstimate.formatted_duration : null
        });
      } else {
        disqualifiedAmbulances.push({
          AmbulanceID: amb.AmbulanceID,
          fleet_code: amb.fleet_code,
          Status: amb.Status,
          Fuel: amb.Fuel,
          reason: !hasFuel
            ? 'INSUFFICIENT_FUEL (Below 20% threshold)'
            : isAssigned
            ? 'ALREADY_ASSIGNED_TO_ACTIVE_INCIDENT'
            : `STATUS_${String(amb.Status).toUpperCase()}`
        });
      }
    }

    // Sort eligible ambulances by travel time (nearest first)
    eligibleAmbulances.sort((a, b) => {
      if (a.estimated_duration_minutes !== null && b.estimated_duration_minutes !== null) {
        return a.estimated_duration_minutes - b.estimated_duration_minutes;
      }
      return 0;
    });

    // 4. Candidate Receiving Hospitals
    const hospitals = await Hospital.findAll({
      where: { is_active: true },
      attributes: ['HospitalID', 'HospitalName', 'Location', 'latitude', 'longitude', 'facility_type']
    });

    const recommendedHospitals = hospitals.map(h => {
      let routeEstimate = null;
      if (hasValidCoordinates(emgLat, emgLng) && hasValidCoordinates(h.latitude, h.longitude)) {
        routeEstimate = googleMapsService.calculateHaversineDistanceAndTime(
          { lat: emgLat, lng: emgLng },
          { lat: parseFloat(h.latitude), lng: parseFloat(h.longitude) }
        );
      }
      return {
        HospitalID: h.HospitalID,
        HospitalName: h.HospitalName,
        Location: h.Location,
        facility_type: h.facility_type,
        distance_km: routeEstimate ? routeEstimate.distance_km : null,
        duration_minutes: routeEstimate ? routeEstimate.duration_minutes : null,
        formatted_duration: routeEstimate ? routeEstimate.formatted_duration : null
      };
    });

    recommendedHospitals.sort((a, b) => (a.duration_minutes || 999) - (b.duration_minutes || 999));

    return {
      type: 'DISPATCH_RECOMMENDATION',
      is_recommendation: true,
      is_confirmed: false,
      emergency_id: emergency.id,
      incident_code: emergency.incident_code,
      emergency_location: {
        address: emergency.location_address,
        latitude: emgLat,
        longitude: emgLng
      },
      severity: emergency.severity,
      eligible_ambulances: eligibleAmbulances,
      disqualified_ambulances: disqualifiedAmbulances,
      recommended_hospitals: recommendedHospitals.slice(0, 5),
      current_assigned_ambulance_id: emergency.assigned_ambulance_id,
      current_assigned_hospital_id: emergency.assigned_hospital_id
    };
  }

  /**
   * Phase 4: Request 6-digit confirmation OTP for dispatch execution
   */
  async requestDispatchOtp(emergencyId, user) {
    const emergency = await this.getEmergencyById(emergencyId);
    if (emergency.status !== EMERGENCY_STATUS.VERIFIED && emergency.status !== EMERGENCY_STATUS.REPORTED) {
      const err = new Error(`Cannot request dispatch OTP for emergency in '${emergency.status}' status. Incident must be REPORTED or VERIFIED.`);
      err.status = 400;
      err.code = 'INVALID_EMERGENCY_STATUS';
      throw err;
    }

    const otpData = otpService.generateDispatchOtp(emergencyId, { generatedBy: user.name });

    await recordAuditEvent({
      userId: user.id,
      eventType: 'DISPATCH_OTP_GENERATED',
      details: {
        incident_code: emergency.incident_code,
        emergency_id: emergency.id,
        expires_at: otpData.expires_at,
        requested_by: user.name
      }
    });

    return {
      incident_code: emergency.incident_code,
      emergency_id: emergency.id,
      ...otpData
    };
  }

  /**
   * Phase 4: Assign Ambulance and Confirm Dispatch
   * Atomic transaction, concurrency lock against multi-assignment, OTP verification, timeline logging
   */
  async assignAndDispatch(emergencyId, dispatchArg, maybeOtpOrUser, maybeUser) {
    let ambulance_id;
    let hospital_id;
    let otp;
    let user;

    if (typeof dispatchArg === 'object' && dispatchArg !== null) {
      ambulance_id = dispatchArg.ambulance_id;
      hospital_id = dispatchArg.hospital_id;
      otp = dispatchArg.otp;
      user = maybeOtpOrUser;
    } else {
      ambulance_id = dispatchArg;
      otp = maybeOtpOrUser;
      user = maybeUser;
    }

    if (!ambulance_id) {
      const err = new Error('ambulance_id is required for dispatch.');
      err.status = 400;
      err.code = 'VALIDATION_ERROR';
      throw err;
    }

    if (otpService.hasPendingOtp(emergencyId)) {
      const verification = otpService.verifyDispatchOtp(emergencyId, otp);
      if (!verification.valid) {
        throw Object.assign(new Error(verification.message), { status: 400, code: verification.reason });
      }
    }
    return this.assignAmbulance(emergencyId, { ambulance_id, hospital_id }, user);
  }

  // =========================================================================
  // PHASE 5: AMBULANCE DISPATCH ENGINE & RESPONSE WORKFLOW METHODS
  // =========================================================================

  /**
   * Phase 5: Generate multi-factor dispatch recommendations for an emergency
   */
  async generateRecommendations(emergencyId, user) {
    const emergency = await this.getEmergencyById(emergencyId);

    const validInitialStatuses = [
      EMERGENCY_STATUS.REPORTED,
      EMERGENCY_STATUS.VERIFIED,
      EMERGENCY_STATUS.DISPATCH_RECOMMENDED
    ];

    if (!validInitialStatuses.includes(emergency.status)) {
      const err = new Error(`Cannot generate dispatch recommendations for emergency in '${emergency.status}' status. Incident must be REPORTED, VERIFIED, or DISPATCH_RECOMMENDED.`);
      err.status = 400;
      err.code = 'INVALID_EMERGENCY_STATUS';
      throw err;
    }

    const transaction = await sequelize.transaction();
    try {
      const prevStatus = emergency.status;
      if (emergency.status !== EMERGENCY_STATUS.DISPATCH_RECOMMENDED) {
        emergency.status = EMERGENCY_STATUS.DISPATCH_RECOMMENDED;
        await emergency.save({ transaction });
      }

      const recResult = await dispatchEngineService.evaluateCandidates(emergency, user, transaction);

      // Append-only event history
      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user?.id || null,
        event_type: EMERGENCY_EVENT_TYPES.RECOMMENDATION_GENERATED,
        from_status: prevStatus,
        to_status: emergency.status,
        ambulance_id: recResult.top_candidate?.ambulance_id || null,
        notes: `Dispatch recommendation generated with ${recResult.candidates_count} eligible candidates and ${recResult.exclusions_count} exclusions.`,
        details_json: JSON.stringify({
          recommendation_uuid: recResult.recommendation_uuid,
          top_candidate: recResult.top_candidate,
          scoring_weights: recResult.scoring_weights
        })
      }, { transaction });

      await transaction.commit();
      return recResult;
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Phase 5: Recalculate recommendations when underlying data or time changes
   */
  async recalculateRecommendations(emergencyId, user) {
    const emergency = await this.getEmergencyById(emergencyId);
    if (!['REPORTED', 'VERIFIED', 'DISPATCH_RECOMMENDED'].includes(emergency.status)) {
      throw Object.assign(new Error('Recommendations can only be recalculated for an unassigned incident.'), { status: 400, code: 'INVALID_EMERGENCY_STATUS' });
    }

    const transaction = await sequelize.transaction();
    try {
      const recResult = await dispatchEngineService.evaluateCandidates(emergency, user, transaction);

      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user?.id || null,
        event_type: EMERGENCY_EVENT_TYPES.RECOMMENDATION_RECALCULATED,
        from_status: emergency.status,
        to_status: emergency.status,
        ambulance_id: recResult.top_candidate?.ambulance_id || null,
        notes: `Dispatch recommendation recalculated by ${user?.name || 'Dispatcher'}. Top candidate: ${recResult.top_candidate ? recResult.top_candidate.fleet_code : 'None'}.`,
        details_json: JSON.stringify({
          recommendation_uuid: recResult.recommendation_uuid,
          top_candidate: recResult.top_candidate
        })
      }, { transaction });

      await transaction.commit();
      return recResult;
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Phase 5: Retrieve current active recommendation with candidate explanations
   */
  async getRecommendations(emergencyId) {
    const emergency = await this.getEmergencyById(emergencyId);

    const rec = await DispatchRecommendation.findOne({
      where: { emergency_id: emergencyId, is_active: true },
      order: [['created_at', 'DESC']],
      include: [
        { model: Ambulance, as: 'recommendedAmbulance', attributes: ['AmbulanceID', 'fleet_code', 'Status', 'Fuel', 'vehicle_type'] },
        { model: Hospital, as: 'recommendedHospital', attributes: ['HospitalID', 'HospitalName', 'Location'] },
        { model: User, as: 'generatedByUser', attributes: ['id', 'name', 'role'] }
      ]
    });

    if (!rec) {
      // If no recommendation generated yet, evaluate one on-demand
      return this.generateRecommendations(emergencyId, null);
    }

    const now = new Date();
    const isExpired = now > new Date(rec.expires_at);

    let candidates = [];
    let exclusions = [];
    let weights = {};

    try {
      candidates = JSON.parse(rec.candidates_json || '[]');
      exclusions = JSON.parse(rec.exclusions_json || '[]');
      weights = JSON.parse(rec.scoring_weights_json || '{}');
    } catch (e) {
      logger.warn(`Failed parsing recommendation JSON: ${e.message}`);
    }

    return {
      recommendation_id: rec.id,
      recommendation_uuid: rec.recommendation_uuid,
      emergency_id: emergency.id,
      incident_code: emergency.incident_code,
      generated_at: rec.created_at,
      expires_at: rec.expires_at,
      is_expired: isExpired,
      scoring_weights: weights,
      top_candidate: candidates[0] || null,
      candidates_count: candidates.length,
      candidates,
      exclusions_count: exclusions.length,
      exclusions,
      recommended_ambulance: rec.recommendedAmbulance,
      recommended_hospital: rec.recommendedHospital
    };
  }

  /**
   * Phase 5: Retrieve eligible ambulances and exclusions directly
   */
  async getEligibleAmbulances(emergencyId) {
    const rec = await this.getRecommendations(emergencyId);
    return {
      emergency_id: emergencyId,
      incident_code: rec.incident_code,
      candidates: rec.candidates,
      exclusions: rec.exclusions,
      is_expired: rec.is_expired
    };
  }

  /**
   * Phase 5: Dispatcher Confirms Ambulance Assignment
   * Enforces:
   * - Recommendation validity and expiration threshold
   * - Dispatcher override reason capture if selecting non-top candidate
   * - Pre-assignment candidate revalidation
   * - SQL Server filtered unique index and transaction concurrency protection
   * - Idempotency protection against duplicate submissions
   * - Append-only timeline history
   */
  async assignAmbulance(emergencyId, data, user, idempotencyKey = null) {
    const {
      ambulance_id,
      hospital_id,
      recommendation_id,
      override_reason,
      notes
    } = data;

    if (!ambulance_id) {
      const err = new Error('ambulance_id is required to confirm ambulance assignment.');
      err.status = 400;
      err.code = 'AMBULANCE_ID_REQUIRED';
      throw err;
    }

    // 1. Duplicate-Action Idempotency Protection
    const transaction = await sequelize.transaction();
    try {
    const key = idempotencyKey || data.idempotency_key;
    if (key) {
      const cached = await idempotencyService.checkIdempotency(
        key,
        `/api/v1/emergencies/${emergencyId}/assign`,
        { ambulance_id, hospital_id, recommendation_id, override_reason },
        user.id, transaction
      );
      if (cached.isCached) {
        await transaction.commit();
        return cached.body;
      }
    }

    const emergency = await Emergency.findByPk(emergencyId, { transaction });
    if (!emergency) {
      const err = new Error(`Emergency incident #${emergencyId} not found.`);
      err.status = 404;
      err.code = 'EMERGENCY_NOT_FOUND';
      throw err;
    }

    // Check emergency status eligibility
    const validAssignStatuses = [
      EMERGENCY_STATUS.REPORTED,
      EMERGENCY_STATUS.VERIFIED,
      EMERGENCY_STATUS.DISPATCH_RECOMMENDED
    ];

    if (!validAssignStatuses.includes(emergency.status)) {
      const err = new Error(`Cannot assign ambulance to emergency in '${emergency.status}' status. Incident must be in an unassigned state.`);
      err.status = 400;
      err.code = 'INVALID_EMERGENCY_STATUS';
      throw err;
    }

    // 2. Validate Recommendation & Check Expiry
    let recommendation = null;
    if (recommendation_id) {
      recommendation = await DispatchRecommendation.findByPk(recommendation_id);
    } else if (emergency.current_recommendation_id) {
      recommendation = await DispatchRecommendation.findByPk(emergency.current_recommendation_id);
    }

    if (recommendation_id && !recommendation) {
      throw Object.assign(new Error('Recommendation not found.'), { status: 404, code: 'RECOMMENDATION_NOT_FOUND' });
    }
    if (recommendation && Number(recommendation.emergency_id) !== Number(emergencyId)) {
      throw Object.assign(new Error('Recommendation belongs to a different incident.'), { status: 409, code: 'RECOMMENDATION_INCIDENT_MISMATCH' });
    }
    if (recommendation) {
      if (!recommendation.is_active || Number(emergency.current_recommendation_id) !== Number(recommendation.id)) {
        throw Object.assign(new Error('Recommendation is superseded. Recalculate before assignment.'), { status: 409, code: 'RECOMMENDATION_SUPERSEDED' });
      }
      if (new Date() > new Date(recommendation.expires_at)) {
        const err = new Error('Dispatch recommendation has expired. Please recalculate recommendations before confirming assignment.');
        err.status = 409;
        err.code = 'RECOMMENDATION_EXPIRED';
        throw err;
      }

      // Check for Dispatcher Override
      const topAmbulanceId = recommendation.recommended_ambulance_id;
      const isOverride = topAmbulanceId && parseInt(ambulance_id, 10) !== parseInt(topAmbulanceId, 10);

      if (isOverride) {
        if (!override_reason || !String(override_reason).trim()) {
          const err = new Error(
            `Dispatcher override detected: Selected ambulance #${ambulance_id} differs from recommended ambulance #${topAmbulanceId}. A required non-empty override reason must be provided.`
          );
          err.status = 400;
          err.code = 'OVERRIDE_REASON_REQUIRED';
          throw err;
        }
      }
    }

    // 3. Immediate Candidate Revalidation
    const reval = await dispatchEngineService.revalidateCandidate(ambulance_id, emergencyId);
    if (!reval.eligible) {
      const err = new Error(reval.reason);
      err.status = 409;
      err.code = 'AMBULANCE_UNAVAILABLE';
      throw err;
    }

    const prevStatus = emergency.status;
    const isOverride = recommendation &&
      recommendation.recommended_ambulance_id &&
      parseInt(ambulance_id, 10) !== parseInt(recommendation.recommended_ambulance_id, 10);


      await sequelize.query('SELECT AmbulanceID FROM dbo.Ambulances WITH (UPDLOCK, HOLDLOCK) WHERE AmbulanceID = :id', { replacements: { id: ambulance_id }, transaction });
      const currentEligibility = await dispatchEngineService.revalidateCandidate(ambulance_id, emergencyId, transaction);
      if (!currentEligibility.eligible) {
        throw Object.assign(new Error(currentEligibility.reason), { status: 409, code: 'AMBULANCE_UNAVAILABLE' });
      }
      // Strict Concurrency Check: verify again inside the transaction
      const activeConflicting = await Emergency.findOne({
        where: {
          assigned_ambulance_id: ambulance_id,
          status: {
            [Op.in]: [
              EMERGENCY_STATUS.DISPATCH_RECOMMENDED,
              EMERGENCY_STATUS.DISPATCHED,
              EMERGENCY_STATUS.EN_ROUTE,
              EMERGENCY_STATUS.AT_PATIENT,
              EMERGENCY_STATUS.TRANSPORTING,
              EMERGENCY_STATUS.AT_HOSPITAL
            ]
          },
          id: { [Op.ne]: emergency.id }
        },
        transaction
      });

      if (activeConflicting) {
        const err = new Error(`Ambulance #${ambulance_id} was concurrently assigned to incident #${activeConflicting.incident_code}. Concurrency check failed.`);
        err.status = 409;
        err.code = 'CONCURRENT_ASSIGNMENT_CONFLICT';
        throw err;
      }

      const ambulance = await Ambulance.findByPk(ambulance_id, { transaction });
      let targetHospitalId = hospital_id || emergency.assigned_hospital_id || ambulance.CurrentHospitalID;

      // Update Emergency
      emergency.assigned_ambulance_id = ambulance.AmbulanceID;
      emergency.assigned_hospital_id = targetHospitalId;
      emergency.status = EMERGENCY_STATUS.DISPATCHED;
      if (isOverride) {
        emergency.override_reason = String(override_reason).trim();
        emergency.override_dispatcher_id = user.id;
      }
      await emergency.save({ transaction });

      // Update Ambulance Status to busy
      ambulance.Status = toDatabaseAmbulanceStatus('busy');
      await ambulance.save({ transaction });

      // Create C++ compatible AmbulanceTimeline entry
      await AmbulanceTimeline.create({
        AmbulanceID: ambulance.AmbulanceID,
        EventType: 'Dispatched',
        Message: `Dispatched to Emergency #${emergency.incident_code} (Severity: ${emergency.severity}) by ${user.name} (${user.role})${isOverride ? ` [OVERRIDE: ${override_reason}]` : ''}`
      }, { transaction });

      // Append-only Emergency Event
      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user.id,
        event_type: isOverride ? EMERGENCY_EVENT_TYPES.OVERRIDE_ASSIGNED : EMERGENCY_EVENT_TYPES.ASSIGNED,
        from_status: prevStatus,
        to_status: EMERGENCY_STATUS.DISPATCHED,
        ambulance_id: ambulance.AmbulanceID,
        hospital_id: targetHospitalId,
        notes: notes || (isOverride ? `Override Reason: ${override_reason}` : 'Ambulance assigned by dispatcher confirmation.'),
        details_json: JSON.stringify({
          is_override: Boolean(isOverride),
          override_reason: isOverride ? override_reason : null,
          recommended_ambulance_id: recommendation?.recommended_ambulance_id || null,
          selected_ambulance_id: ambulance.AmbulanceID,
          dispatcher: { id: user.id, name: user.name, role: user.role }
        })
      }, { transaction });

      // Security Audit Record
      await recordAuditEvent({
        userId: user.id,
        eventType: isOverride ? 'DISPATCH_OVERRIDE_ASSIGNED' : AUDIT_EVENTS.EMERGENCY_DISPATCHED,
        details: {
          action: 'ASSIGN_AMBULANCE',
          incident_code: emergency.incident_code,
          emergency_id: emergency.id,
          ambulance_id: ambulance.AmbulanceID,
          fleet_code: ambulance.fleet_code,
          hospital_id: targetHospitalId,
          is_override: Boolean(isOverride),
          override_reason: isOverride ? override_reason : undefined,
          dispatched_by: user.name,
          actor_role: user.role
        },
        transaction
      });

      const result = await this.getEmergencyById(emergency.id, transaction);

      // Cache idempotent response
      if (key) {
        await idempotencyService.saveIdempotencyRecord({
          key,
          userId: user.id,
          path: `/api/v1/emergencies/${emergencyId}/assign`,
          hash: idempotencyService.hashPayload({ ambulance_id, hospital_id, recommendation_id, override_reason }),
          status: 200,
          body: result,
          transaction
        });
      }

      await transaction.commit();

      syncFleetState({
        ambulanceId: ambulance.AmbulanceID,
        operationalStatus: 'ASSIGNED',
        assignmentId: emergency.id
      });

      return result;
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      // Handle SQL Server Filtered Unique Index violation gracefully
      if (err.name === 'SequelizeUniqueConstraintError' || err.message?.includes('UQ_Emergencies_ActiveAmbulance')) {
        const conflictErr = new Error(`Ambulance #${ambulance_id} is already actively assigned to another emergency incident. Database concurrency constraint prevented double assignment.`);
        conflictErr.status = 409;
        conflictErr.code = 'CONCURRENT_ASSIGNMENT_CONFLICT';
        throw conflictErr;
      }
      throw err;
    }
  }

  /**
   * Phase 5: Controlled Ambulance Reassignment
   */
  async reassignAmbulance(emergencyId, data, user, idempotencyKey = null) {
    const { new_ambulance_id, reason, notes } = data;

    if (!new_ambulance_id) {
      const err = new Error('new_ambulance_id is required for reassignment.');
      err.status = 400;
      err.code = 'NEW_AMBULANCE_REQUIRED';
      throw err;
    }

    if (!reason || !String(reason).trim()) {
      const err = new Error('A valid reason is required for ambulance reassignment.');
      err.status = 400;
      err.code = 'REASSIGNMENT_REASON_REQUIRED';
      throw err;
    }

    const transaction = await sequelize.transaction();
    try {
    const key = idempotencyKey || data.idempotency_key;
    if (key) {
      const cached = await idempotencyService.checkIdempotency(
        key,
        `/api/v1/emergencies/${emergencyId}/reassign`,
        { new_ambulance_id, reason },
        user.id, transaction
      );
      if (cached.isCached) { await transaction.commit(); return cached.body; }
    }

    const emergency = await Emergency.findByPk(emergencyId, { transaction });
    if (!emergency) {
      const err = new Error(`Emergency incident #${emergencyId} not found.`);
      err.status = 404;
      err.code = 'EMERGENCY_NOT_FOUND';
      throw err;
    }

    const reassignableStatuses = [EMERGENCY_STATUS.DISPATCHED, EMERGENCY_STATUS.EN_ROUTE];
    if (!reassignableStatuses.includes(emergency.status)) {
      const err = new Error(`Cannot reassign ambulance for incident in '${emergency.status}' status. Reassignment is only allowed when DISPATCHED or EN_ROUTE.`);
      err.status = 400;
      err.code = 'INVALID_EMERGENCY_STATUS';
      throw err;
    }

    const prevAmbulanceId = emergency.assigned_ambulance_id;
    if (parseInt(prevAmbulanceId, 10) === parseInt(new_ambulance_id, 10)) {
      const err = new Error('New ambulance ID must be different from currently assigned ambulance.');
      err.status = 400;
      err.code = 'SAME_AMBULANCE_REASSIGNMENT';
      throw err;
    }

    // Revalidate new candidate
    const reval = await dispatchEngineService.revalidateCandidate(new_ambulance_id, emergencyId);
    if (!reval.eligible) {
      const err = new Error(reval.reason);
      err.status = 409;
      err.code = 'AMBULANCE_UNAVAILABLE';
      throw err;
    }


      const lockedIds = [prevAmbulanceId, Number(new_ambulance_id)].filter(Boolean).sort((a, b) => a - b);
      for (const id of lockedIds) await sequelize.query('SELECT AmbulanceID FROM dbo.Ambulances WITH (UPDLOCK, HOLDLOCK) WHERE AmbulanceID = :id', { replacements: { id }, transaction });
      const currentEligibility = await dispatchEngineService.revalidateCandidate(new_ambulance_id, emergencyId, transaction);
      if (!currentEligibility.eligible) throw Object.assign(new Error(currentEligibility.reason), { status: 409, code: 'AMBULANCE_UNAVAILABLE' });
      const prevStatus = emergency.status;
      // 1. Release previous ambulance back to available
      if (prevAmbulanceId) {
        const prevAmb = await Ambulance.findByPk(prevAmbulanceId, { transaction });
        if (prevAmb) {
          prevAmb.Status = toDatabaseAmbulanceStatus('available');
          await prevAmb.save({ transaction });

          await AmbulanceTimeline.create({
            AmbulanceID: prevAmb.AmbulanceID,
            EventType: 'Reassigned',
            Message: `Ambulance released from Emergency #${emergency.incident_code} due to reassignment: ${reason}`
          }, { transaction });
        }
      }

      // 2. Mark new ambulance as busy
      const newAmb = await Ambulance.findByPk(new_ambulance_id, { transaction });
      newAmb.Status = toDatabaseAmbulanceStatus('busy');
      await newAmb.save({ transaction });

      await AmbulanceTimeline.create({
        AmbulanceID: newAmb.AmbulanceID,
        EventType: 'Dispatched',
        Message: `Reassigned and Dispatched to Emergency #${emergency.incident_code} (Reassigned from #${prevAmbulanceId}): ${reason}`
      }, { transaction });

      // 3. Update Emergency
      emergency.assigned_ambulance_id = newAmb.AmbulanceID;
      emergency.status = EMERGENCY_STATUS.DISPATCHED;
      await emergency.save({ transaction });

      // 4. Record Emergency Event
      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user.id,
        event_type: EMERGENCY_EVENT_TYPES.REASSIGNED,
        from_status: prevStatus,
        to_status: EMERGENCY_STATUS.DISPATCHED,
        ambulance_id: newAmb.AmbulanceID,
        notes: `Reassigned from Ambulance #${prevAmbulanceId} to #${newAmb.AmbulanceID}. Reason: ${reason}. Notes: ${notes || ''}`,
        details_json: JSON.stringify({
          previous_ambulance_id: prevAmbulanceId,
          new_ambulance_id: newAmb.AmbulanceID,
          reason,
          reassigned_by: { id: user.id, name: user.name, role: user.role }
        })
      }, { transaction });

      // 5. Audit Log
      await recordAuditEvent({
        userId: user.id,
        eventType: 'EMERGENCY_REASSIGNED',
        details: {
          incident_code: emergency.incident_code,
          emergency_id: emergency.id,
          previous_ambulance_id: prevAmbulanceId,
          new_ambulance_id: newAmb.AmbulanceID,
          reason,
          reassigned_by: user.name,
          actor_role: user.role
        },
        transaction
      });

      const result = await this.getEmergencyById(emergency.id, transaction);

      if (key) {
        await idempotencyService.saveIdempotencyRecord({
          key,
          userId: user.id,
          path: `/api/v1/emergencies/${emergencyId}/reassign`,
          hash: idempotencyService.hashPayload({ new_ambulance_id, reason }),
          status: 200,
          body: result,
          transaction
        });
      }

      await transaction.commit();
      if (prevAmbulanceId) {
        syncFleetState({ ambulanceId: prevAmbulanceId, operationalStatus: 'AVAILABLE' });
      }
      syncFleetState({ ambulanceId: newAmb.AmbulanceID, operationalStatus: 'ASSIGNED', assignmentId: emergency.id });
      return result;
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Phase 5: Escalate emergency requiring urgent supervisor/manual handling
   */
  async escalateEmergency(emergencyId, data, user) {
    const { reason, notes } = data;
    if (!reason || !String(reason).trim()) {
      const err = new Error('A reason is required to escalate an emergency incident.');
      err.status = 400;
      err.code = 'ESCALATION_REASON_REQUIRED';
      throw err;
    }

    const emergency = await Emergency.findByPk(emergencyId);
    if (!emergency) {
      const err = new Error(`Emergency incident #${emergencyId} not found.`);
      err.status = 404;
      err.code = 'EMERGENCY_NOT_FOUND';
      throw err;
    }

    const transaction = await sequelize.transaction();
    try {
      emergency.escalated_at = new Date();
      emergency.escalation_reason = String(reason).trim();
      await emergency.save({ transaction });

      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user.id,
        event_type: EMERGENCY_EVENT_TYPES.ESCALATED,
        from_status: emergency.status,
        to_status: emergency.status,
        notes: `Emergency flagged for escalation: ${reason}. Notes: ${notes || ''}`,
        details_json: JSON.stringify({
          escalated_by: { id: user.id, name: user.name, role: user.role },
          reason
        })
      }, { transaction });

      await recordAuditEvent({
        userId: user.id,
        eventType: 'EMERGENCY_ESCALATED',
        details: {
          incident_code: emergency.incident_code,
          emergency_id: emergency.id,
          reason,
          escalated_by: user.name,
          actor_role: user.role
        },
        transaction
      });

      await transaction.commit();
      return this.getEmergencyById(emergency.id);
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Phase 5: Update Emergency Response Lifecycle Status
   * Validates full state machine, role permissions, release of vehicles, and records timeline
   */
  async updateResponseLifecycleStatus(emergencyId, data, user, idempotencyKey = null) {
    const { status, notes, resolution_notes, hospital_id } = data;

    if (!status) {
      const err = new Error('status is required for lifecycle status transition.');
      err.status = 400;
      err.code = 'STATUS_REQUIRED';
      throw err;
    }

    const transaction = await sequelize.transaction();
    try {
    const key = idempotencyKey || data.idempotency_key;
    if (key) {
      const cached = await idempotencyService.checkIdempotency(
        key,
        `/api/v1/emergencies/${emergencyId}/status`,
        { status, notes, resolution_notes, hospital_id },
        user.id, transaction
      );
      if (cached.isCached) { await transaction.commit(); return cached.body; }
    }

    const emergency = await Emergency.findByPk(emergencyId, { transaction });
    if (!emergency) {
      const err = new Error(`Emergency incident #${emergencyId} not found.`);
      err.status = 404;
      err.code = 'EMERGENCY_NOT_FOUND';
      throw err;
    }

    if (user.role === 'AMBULANCE_CREW' &&
        Number(env.fleet.crewBindings[String(user.id)]) !== Number(emergency.assigned_ambulance_id)) {
      throw Object.assign(new Error('Crew access requires an assigned vehicle binding.'), { status: 403, code: 'INCIDENT_ACCESS_DENIED' });
    }
    const prevStatus = emergency.status;
    const newStatus = String(status).toUpperCase();

    // 1. Validate State Machine Transition
    if (newStatus !== prevStatus && !isValidTransition(prevStatus, newStatus)) {
      const allowed = getNextAllowedTransitions(prevStatus);
      const err = new Error(
        `Invalid status transition from '${prevStatus}' to '${newStatus}'. Permitted transitions: ${allowed.length ? allowed.join(', ') : 'None (Terminal state)'}`
      );
      err.status = 400;
      err.code = 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    // 2. Validate Role Permissions
    if (!authorizeTransition(user.role, newStatus)) {
      const err = new Error(`User with role '${user.role}' is not authorized to transition incident to '${newStatus}'.`);
      err.status = 403;
      err.code = 'FORBIDDEN_STATUS_TRANSITION';
      throw err;
    }

    if (data.version !== undefined && (!Number.isSafeInteger(data.version) || data.version !== emergency.version)) {
      throw Object.assign(new Error('The incident version changed. Refresh before retrying.'), { status: 409, code: 'CONCURRENT_INCIDENT_UPDATE' });
    }
    if (newStatus === prevStatus) { await transaction.commit(); return this.getEmergencyById(emergencyId); }
    if (newStatus === EMERGENCY_STATUS.DISPATCHED && !emergency.assigned_ambulance_id) {
      throw Object.assign(new Error('Use the assignment endpoint to dispatch an ambulance.'), { status: 400, code: 'ASSIGNMENT_REQUIRED' });
    }

    // Special checks for cancellation & resolution
    if (newStatus === EMERGENCY_STATUS.CANCELLED && (!notes && !data.cancellation_reason)) {
      const err = new Error('A cancellation reason/note is required when cancelling an emergency incident.');
      err.status = 400;
      err.code = 'CANCELLATION_REASON_REQUIRED';
      throw err;
    }

    if (newStatus === EMERGENCY_STATUS.RESOLVED && (!resolution_notes && !notes)) {
      const err = new Error('Resolution notes are required when marking an emergency as RESOLVED.');
      err.status = 400;
      err.code = 'RESOLUTION_NOTES_REQUIRED';
      throw err;
    }


      emergency.status = newStatus;

      if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(newStatus) && !emergency.resolved_at) {
        emergency.resolved_at = new Date();
      }

      if (resolution_notes || notes) {
        emergency.resolution_notes = resolution_notes || notes;
      }

      if (hospital_id) {
        emergency.assigned_hospital_id = hospital_id;
      }

      // If resolving, closing, or cancelling, release ambulance back to AVAILABLE
      let releasedAmbulance = null;
      if (shouldReleaseAmbulance(newStatus) && !shouldReleaseAmbulance(prevStatus) && emergency.assigned_ambulance_id) {
        const amb = await Ambulance.findByPk(emergency.assigned_ambulance_id, { transaction });
        if (amb) {
          amb.Status = toDatabaseAmbulanceStatus('available');
          await amb.save({ transaction });
          releasedAmbulance = amb;

          await AmbulanceTimeline.create({
            AmbulanceID: amb.AmbulanceID,
            EventType: 'Released',
            Message: `Ambulance released to AVAILABLE following Emergency #${emergency.incident_code} transition to ${newStatus}`
          }, { transaction });
        }
      }

      await emergency.save({ transaction });

      // Append-only Event History
      let eventType = EMERGENCY_EVENT_TYPES.STATUS_CHANGE;
      if (newStatus === EMERGENCY_STATUS.CANCELLED) eventType = EMERGENCY_EVENT_TYPES.CANCELLED;
      if (newStatus === EMERGENCY_STATUS.RESOLVED) eventType = EMERGENCY_EVENT_TYPES.RESOLVED;
      if (newStatus === EMERGENCY_STATUS.CLOSED) eventType = EMERGENCY_EVENT_TYPES.CLOSED;

      await EmergencyEvent.create({
        emergency_id: emergency.id,
        user_id: user.id,
        event_type: eventType,
        from_status: prevStatus,
        to_status: newStatus,
        ambulance_id: emergency.assigned_ambulance_id,
        hospital_id: emergency.assigned_hospital_id,
        notes: notes || resolution_notes || `Status transitioned from ${prevStatus} to ${newStatus}`,
        details_json: JSON.stringify({
          updated_by: { id: user.id, name: user.name, role: user.role },
          ambulance_released: Boolean(releasedAmbulance)
        })
      }, { transaction });

      // Security Audit Record
      await recordAuditEvent({
        userId: user.id,
        eventType: AUDIT_EVENTS.EMERGENCY_STATUS_CHANGED,
        details: {
          action: 'RESPONSE_STATUS_TRANSITION',
          incident_code: emergency.incident_code,
          emergency_id: emergency.id,
          from_status: prevStatus,
          to_status: newStatus,
          ambulance_id: emergency.assigned_ambulance_id,
          notes: notes || resolution_notes || undefined,
          resolution_notes: resolution_notes || undefined,
          changed_by: user.name,
          actor_role: user.role
        },
        transaction
      });

      const result = await this.getEmergencyById(emergency.id, transaction);

      if (key) {
        await idempotencyService.saveIdempotencyRecord({
          key,
          userId: user.id,
          path: `/api/v1/emergencies/${emergencyId}/status`,
          hash: idempotencyService.hashPayload({ status, notes, resolution_notes, hospital_id }),
          status: 200,
          body: result,
          transaction
        });
      }

      await transaction.commit();
      if (emergency.assigned_ambulance_id) {
        syncFleetState({
          ambulanceId: emergency.assigned_ambulance_id,
          operationalStatus: fleetStatusForEmergency(newStatus),
          assignmentId: shouldReleaseAmbulance(newStatus) ? null : emergency.id
        });
      }
      return result;
    } catch (err) {
      if (!transaction.finished) await transaction.rollback();
      throw err;
    }
  }

  /**
   * Phase 5: Retrieve complete append-only emergency event timeline
   */
  async getEmergencyEventHistory(emergencyId, { page = 1, limit = 50 } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await EmergencyEvent.findAndCountAll({
      where: { emergency_id: emergencyId },
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'role'] },
        { model: Ambulance, as: 'ambulance', attributes: ['AmbulanceID', 'fleet_code', 'Status'] }
      ],
      order: [['created_at', 'ASC']],
      limit: limitNum,
      offset
    });

    return {
      emergency_id: emergencyId,
      events: rows.map(e => ({
        id: e.id,
        event_type: e.event_type,
        from_status: e.from_status,
        to_status: e.to_status,
        ambulance_id: e.ambulance_id,
        ambulance_fleet_code: e.ambulance?.fleet_code || null,
        hospital_id: e.hospital_id,
        notes: e.notes,
        created_at: e.created_at,
        actor: e.user ? { id: e.user.id, name: e.user.name, role: e.user.role } : null,
        details: e.details_json ? JSON.parse(e.details_json) : null
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    };
  }

  /**
   * Phase 5: Retrieve hospital candidates for an emergency using Phase 4 data
   */
  async getEmergencyHospitals(emergencyId) {
    const emergency = await this.getEmergencyById(emergencyId);
    const emgLat = emergency.latitude !== null && emergency.latitude !== undefined ? parseFloat(emergency.latitude) : null;
    const emgLng = emergency.longitude !== null && emergency.longitude !== undefined ? parseFloat(emergency.longitude) : null;

    let candidateHospitals = [];

    // 1. If incident has coordinates, perform Phase 4 dynamic discovery (DB + Google Places + Google Routes)
    if (hasValidCoordinates(emgLat, emgLng)) {
      try {
        const nearbyResult = await hospitalService.findNearbyHospitals({
          latitude: emgLat,
          longitude: emgLng,
          radius: 20000
        });

        if (nearbyResult && nearbyResult.hospitals && nearbyResult.hospitals.length > 0) {
          for (const h of nearbyResult.hospitals) {
            let hid = h.HospitalID || h.id;

            // If discovered from Google Places and not yet in database, register or link it
            if (!h.HospitalID && h.google_place_id) {
              try {
                let dbHospital = await Hospital.findOne({
                  where: {
                    [Op.or]: [
                      { google_place_id: h.google_place_id },
                      { HospitalName: (h.name || h.HospitalName).substring(0, 50) }
                    ]
                  }
                });

                if (!dbHospital) {
                  dbHospital = await Hospital.create({
                    HospitalName: (h.name || h.HospitalName || 'Google Place Hospital').substring(0, 50),
                    Location: (h.address || h.Location || 'Bengaluru').substring(0, 100),
                    address: h.address || null,
                    city: h.city || 'Bengaluru',
                    state: h.state || 'Karnataka',
                    google_place_id: h.google_place_id,
                    latitude: h.latitude,
                    longitude: h.longitude,
                    facility_type: h.facility_type || 'GENERAL_HOSPITAL',
                    is_active: true,
                    data_source: DATA_SOURCES.GOOGLE_PLACES
                  });
                }

                if (dbHospital) {
                  hid = dbHospital.HospitalID;
                  h.HospitalID = dbHospital.HospitalID;
                }
              } catch (err) {
                logger.warn(`[EmergencyService] Could not persist Google Places hospital candidate: ${err.message}`);
              }
            }

            candidateHospitals.push({
              id: hid,
              HospitalID: hid,
              hospital_id: hid,
              name: h.name || h.HospitalName,
              HospitalName: h.HospitalName || h.name,
              address: h.address || h.Location,
              facility_type: h.facility_type || 'GENERAL_HOSPITAL',
              distance_km: h.distance_km || h.route_distance_km || null,
              travel_time_minutes: h.duration_minutes || (h.estimated_duration_seconds ? Math.round(h.estimated_duration_seconds / 60) : null),
              formatted_duration: h.formatted_duration || null,
              data_source: h.data_source || 'LOCAL_DATABASE',
              capacity_status: 'UNKNOWN',
              is_estimated: h.is_route_estimated !== false,
              routing_fallback: h.is_route_estimated !== false,
              is_current_destination: emergency.assigned_hospital_id === hid,
              capabilities: h.facility_type ? [h.facility_type] : [],
              capabilities_verified: false
            });
          }
        }
      } catch (err) {
        logger.warn(`[EmergencyService] Dynamic nearby discovery failed, falling back to database: ${err.message}`);
      }
    }

    // 2. Fallback if no dynamic candidates found (e.g. coordinates absent or discovery empty)
    if (candidateHospitals.length === 0) {
      const hospitals = await Hospital.findAll({
        where: { is_active: true },
        attributes: ['HospitalID', 'HospitalName', 'Location', 'latitude', 'longitude', 'facility_type', 'data_source']
      });

      candidateHospitals = hospitals.map(h => {
        let routeEstimate = null;
        if (hasValidCoordinates(emgLat, emgLng) && hasValidCoordinates(h.latitude, h.longitude)) {
          routeEstimate = googleMapsService.calculateHaversineDistanceAndTime(
            { lat: emgLat, lng: emgLng },
            { lat: parseFloat(h.latitude), lng: parseFloat(h.longitude) }
          );
        }
        return {
          id: h.HospitalID,
          HospitalID: h.HospitalID,
          hospital_id: h.HospitalID,
          name: h.HospitalName,
          HospitalName: h.HospitalName,
          address: h.Location,
          facility_type: h.facility_type,
          distance_km: routeEstimate ? routeEstimate.distance_km : null,
          travel_time_minutes: routeEstimate ? routeEstimate.duration_minutes : null,
          formatted_duration: routeEstimate ? routeEstimate.formatted_duration : null,
          data_source: h.data_source || 'LOCAL_DATABASE',
          capacity_status: 'UNKNOWN',
          is_estimated: true,
          routing_fallback: true,
          is_current_destination: emergency.assigned_hospital_id === h.HospitalID,
          capabilities: h.facility_type ? [h.facility_type] : [],
              capabilities_verified: false
        };
      });
    }

    candidateHospitals.sort((a, b) => (a.travel_time_minutes || 999) - (b.travel_time_minutes || 999));

    return {
      emergency_id: emergency.id,
      incident_code: emergency.incident_code,
      assigned_hospital_id: emergency.assigned_hospital_id,
      hospitals: candidateHospitals
    };
  }

  /**
   * Phase 5: Retrieve active emergency assignments across fleet
   */
  async getActiveAssignments(user) {
    const crewVehicle = user?.role === 'AMBULANCE_CREW' ? Number(env.fleet.crewBindings[String(user.id)]) : null;
    if (user?.role === 'AMBULANCE_CREW' && !crewVehicle) {
      throw Object.assign(new Error('Crew access requires an assigned vehicle binding.'), { status: 403, code: 'INCIDENT_ACCESS_DENIED' });
    }
    const activeEmergencies = await Emergency.findAll({
      where: {
        assigned_ambulance_id: crewVehicle || { [Op.ne]: null },
        status: {
          [Op.in]: [
            EMERGENCY_STATUS.DISPATCH_RECOMMENDED,
            EMERGENCY_STATUS.DISPATCHED,
            EMERGENCY_STATUS.EN_ROUTE,
            EMERGENCY_STATUS.AT_PATIENT,
            EMERGENCY_STATUS.TRANSPORTING,
            EMERGENCY_STATUS.AT_HOSPITAL
          ]
        }
      },
      include: [
        { model: Ambulance, as: 'assignedAmbulance', attributes: ['AmbulanceID', 'fleet_code', 'Status', 'Fuel', 'vehicle_type', 'current_location_lat', 'current_location_lng'] },
        { model: Hospital, as: 'assignedHospital', attributes: ['HospitalID', 'HospitalName', 'Location'] }
      ],
      order: [['updated_at', 'DESC']]
    });

    return {
      active_count: activeEmergencies.length,
      assignments: activeEmergencies.map(e => ({
        emergency_id: e.id,
        incident_code: e.incident_code,
        status: e.status,
        severity: e.severity,
        emergency_type: e.emergency_type,
        location_address: e.location_address,
        assigned_ambulance: e.assignedAmbulance,
        assigned_hospital: e.assignedHospital,
        escalated_at: e.escalated_at,
        escalation_reason: e.escalation_reason,
        updated_at: e.updated_at
      }))
    };
  }
}


export const emergencyService = new EmergencyService();
export default emergencyService;
