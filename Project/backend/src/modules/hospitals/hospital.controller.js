import hospitalService from './hospital.service.js';
import hospitalSyncService from './hospitalSync.service.js';
import { SYNC_TRIGGERS } from './hospitalSyncHistory.model.js';
import { formatSuccess } from '../../utils/responseFormatter.js';

export const listHospitals = async (req, res, next) => {
  try {
    const result = await hospitalService.listHospitals(req.query);
    res.json(formatSuccess(result.hospitals, result.pagination));
  } catch (err) {
    next(err);
  }
};

export const getHospitalById = async (req, res, next) => {
  try {
    const hospital = await hospitalService.getHospitalById(req.params.id);
    res.json(formatSuccess(hospital));
  } catch (err) {
    next(err);
  }
};

export const createHospital = async (req, res, next) => {
  try {
    const hospital = await hospitalService.createHospital(req.body, req.user);
    res.status(201).json(formatSuccess(hospital, { message: 'Hospital created successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateHospital = async (req, res, next) => {
  try {
    const hospital = await hospitalService.updateHospital(req.params.id, req.body, req.user);
    res.json(formatSuccess(hospital, { message: 'Hospital updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateHospitalStatus = async (req, res, next) => {
  try {
    const hospital = await hospitalService.updateHospitalStatus(req.params.id, req.body.is_active, req.user);
    res.json(formatSuccess(hospital, { message: 'Hospital status updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const getNearbyHospitals = async (req, res, next) => {
  try {
    const { lat, latitude, lng, longitude, radius, ambulance_id } = req.query;
    const result = await hospitalService.findNearbyHospitals({
      latitude: lat ?? latitude,
      longitude: lng ?? longitude,
      radius,
      ambulance_id
    });
    res.json(formatSuccess(result));
  } catch (err) {
    next(err);
  }
};

export const triggerManualSync = async (req, res, next) => {
  try {
    const result = await hospitalSyncService.performSync({
      trigger: SYNC_TRIGGERS.MANUAL
    });
    if (!result.success && result.syncJob) {
      return res.status(409).json(formatSuccess(result, { message: result.message }));
    }
    res.json(formatSuccess(result, { message: 'Hospital directory synchronization triggered successfully' }));
  } catch (err) {
    next(err);
  }
};

export const getSyncStatus = async (req, res, next) => {
  try {
    const status = await hospitalSyncService.getSyncStatus();
    res.json(formatSuccess(status));
  } catch (err) {
    next(err);
  }
};

export const getSyncHistory = async (req, res, next) => {
  try {
    const result = await hospitalSyncService.getSyncHistory(req.query);
    res.json(formatSuccess(result.history, result.pagination));
  } catch (err) {
    next(err);
  }
};

export default {
  listHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  updateHospitalStatus,
  getNearbyHospitals,
  triggerManualSync,
  getSyncStatus,
  getSyncHistory
};
