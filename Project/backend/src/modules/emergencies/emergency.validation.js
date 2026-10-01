import { EMERGENCY_STATUS, EMERGENCY_TYPES } from './emergency.model.js';

export const validateCreateEmergency = (req) => {
  const { emergency_type, severity, location_address, latitude, longitude, patient_id } = req.body;

  if (!location_address || !location_address.trim()) {
    return 'location_address is required.';
  }

  if (emergency_type && !Object.values(EMERGENCY_TYPES).includes(emergency_type)) {
    return `Invalid emergency_type. Allowed types: ${Object.values(EMERGENCY_TYPES).join(', ')}`;
  }

  if (severity !== undefined) {
    const sev = parseInt(severity, 10);
    if (isNaN(sev) || sev < 1 || sev > 5) {
      return 'severity must be an integer between 1 (Low) and 5 (Critical).';
    }
  }

  if (patient_id !== undefined && patient_id !== null && isNaN(parseInt(patient_id, 10))) {
    return 'patient_id must be a valid integer ID.';
  }

  if (latitude !== undefined && latitude !== null) {
    const lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'latitude must be between -90 and 90.';
    }
  }

  if (longitude !== undefined && longitude !== null) {
    const lng = parseFloat(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'longitude must be between -180 and 180.';
    }
  }

  return null;
};

export const validateUpdateEmergency = (req) => {
  const { emergency_type, severity, location_address, latitude, longitude, patient_id, status } = req.body;

  if (emergency_type && !Object.values(EMERGENCY_TYPES).includes(emergency_type)) {
    return `Invalid emergency_type. Allowed types: ${Object.values(EMERGENCY_TYPES).join(', ')}`;
  }

  if (severity !== undefined) {
    const sev = parseInt(severity, 10);
    if (isNaN(sev) || sev < 1 || sev > 5) {
      return 'severity must be an integer between 1 and 5.';
    }
  }

  if (location_address !== undefined && !location_address.trim()) {
    return 'location_address cannot be empty.';
  }

  if (status && !Object.values(EMERGENCY_STATUS).includes(status)) {
    return `Invalid status. Allowed statuses: ${Object.values(EMERGENCY_STATUS).join(', ')}`;
  }

  if (patient_id !== undefined && patient_id !== null && isNaN(parseInt(patient_id, 10))) {
    return 'patient_id must be a valid integer ID.';
  }

  if (latitude !== undefined && latitude !== null) {
    const lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'latitude must be between -90 and 90.';
    }
  }

  if (longitude !== undefined && longitude !== null) {
    const lng = parseFloat(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'longitude must be between -180 and 180.';
    }
  }

  return null;
};

export const validateUpdateEmergencyStatus = (req) => {
  const { status } = req.body;

  if (!status) {
    return 'status is required.';
  }

  if (!Object.values(EMERGENCY_STATUS).includes(status.toUpperCase())) {
    return `Invalid status. Allowed statuses: ${Object.values(EMERGENCY_STATUS).join(', ')}`;
  }

  return null;
};
