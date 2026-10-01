import emergencyService from './emergency.service.js';
import { formatSuccess } from '../../utils/responseFormatter.js';

export const listEmergencies = async (req, res, next) => {
  try {
    const result = await emergencyService.listEmergencies(req.query);
    res.json(formatSuccess(result.emergencies, result.pagination));
  } catch (err) {
    next(err);
  }
};

export const getEmergencyById = async (req, res, next) => {
  try {
    const emergency = await emergencyService.getEmergencyById(req.params.id);
    res.json(formatSuccess(emergency));
  } catch (err) {
    next(err);
  }
};

export const createEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.createEmergency(req.body, req.user);
    res.status(201).json(formatSuccess(emergency, { message: 'Emergency incident created successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.updateEmergency(req.params.id, req.body, req.user);
    res.json(formatSuccess(emergency, { message: 'Emergency incident updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateEmergencyStatus = async (req, res, next) => {
  try {
    const emergency = await emergencyService.updateEmergencyStatus(req.params.id, req.body, req.user);
    res.json(formatSuccess(emergency, { message: 'Emergency incident status updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const getDispatchRecommendations = async (req, res, next) => {
  try {
    const recommendations = await emergencyService.getRecommendations(req.params.id);
    const unified = {
      ...recommendations,
      eligible_ambulances: recommendations.candidates || [],
      disqualified_ambulances: recommendations.exclusions || [],
      recommended_hospitals: recommendations.recommended_hospitals || []
    };
    res.json(formatSuccess(unified));
  } catch (err) {
    next(err);
  }
};

export const requestDispatchOtp = async (req, res, next) => {
  try {
    const otpData = await emergencyService.requestDispatchOtp(req.params.id, req.user);
    res.json(formatSuccess(otpData, { message: 'Dispatch confirmation OTP generated' }));
  } catch (err) {
    next(err);
  }
};

export const assignAndDispatch = async (req, res, next) => {
  try {
    const emergency = await emergencyService.assignAndDispatch(req.params.id, req.body, req.user);
    res.json(formatSuccess(emergency, { message: 'Ambulance assigned and emergency dispatched successfully' }));
  } catch (err) {
    next(err);
  }
};

// =========================================================================
// PHASE 5 CONTROLLERS
// =========================================================================

export const generateRecommendations = async (req, res, next) => {
  try {
    const recommendations = await emergencyService.generateRecommendations(req.params.id, req.user);
    res.status(201).json(formatSuccess(recommendations, { message: 'Dispatch recommendations generated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const recalculateRecommendations = async (req, res, next) => {
  try {
    const recommendations = await emergencyService.recalculateRecommendations(req.params.id, req.user);
    res.json(formatSuccess(recommendations, { message: 'Dispatch recommendations recalculated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const getEligibleAmbulances = async (req, res, next) => {
  try {
    const result = await emergencyService.getEligibleAmbulances(req.params.id);
    res.json(formatSuccess(result));
  } catch (err) {
    next(err);
  }
};

export const assignAmbulance = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key;
    const emergency = await emergencyService.assignAmbulance(req.params.id, req.body, req.user, idempotencyKey);
    res.json(formatSuccess(emergency, { message: 'Ambulance assigned successfully' }));
  } catch (err) {
    next(err);
  }
};

export const reassignAmbulance = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key;
    const emergency = await emergencyService.reassignAmbulance(req.params.id, req.body, req.user, idempotencyKey);
    res.json(formatSuccess(emergency, { message: 'Ambulance reassigned successfully' }));
  } catch (err) {
    next(err);
  }
};

export const escalateEmergency = async (req, res, next) => {
  try {
    const emergency = await emergencyService.escalateEmergency(req.params.id, req.body, req.user);
    res.json(formatSuccess(emergency, { message: 'Emergency escalated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateResponseLifecycleStatus = async (req, res, next) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotency_key;
    const emergency = await emergencyService.updateResponseLifecycleStatus(req.params.id, req.body, req.user, idempotencyKey);
    res.json(formatSuccess(emergency, { message: 'Emergency status updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const getEmergencyEventHistory = async (req, res, next) => {
  try {
    const result = await emergencyService.getEmergencyEventHistory(req.params.id, req.query);
    res.json(formatSuccess(result.events, result.pagination));
  } catch (err) {
    next(err);
  }
};

export const getEmergencyHospitals = async (req, res, next) => {
  try {
    const result = await emergencyService.getEmergencyHospitals(req.params.id);
    res.json(formatSuccess(result));
  } catch (err) {
    next(err);
  }
};

export const getActiveAssignments = async (req, res, next) => {
  try {
    const result = await emergencyService.getActiveAssignments();
    res.json(formatSuccess(result));
  } catch (err) {
    next(err);
  }
};

export default {
  listEmergencies,
  getEmergencyById,
  createEmergency,
  updateEmergency,
  updateEmergencyStatus,
  getDispatchRecommendations,
  requestDispatchOtp,
  assignAndDispatch,
  generateRecommendations,
  recalculateRecommendations,
  getEligibleAmbulances,
  assignAmbulance,
  reassignAmbulance,
  escalateEmergency,
  updateResponseLifecycleStatus,
  getEmergencyEventHistory,
  getEmergencyHospitals,
  getActiveAssignments
};

