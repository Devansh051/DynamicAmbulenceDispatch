import { FACILITY_TYPES, OWNERSHIP_TYPES, DATA_SOURCES } from './hospital.model.js';

export const validateCreateHospital = (req) => {
  const { name, facility_type, ownership, latitude, longitude, postal_code, phone } = req.body;

  if (!name || !name.trim()) {
    return 'Hospital name is required.';
  }

  if (facility_type && !Object.values(FACILITY_TYPES).includes(facility_type)) {
    return `Invalid facility_type. Allowed types: ${Object.values(FACILITY_TYPES).join(', ')}`;
  }

  if (ownership && !Object.values(OWNERSHIP_TYPES).includes(ownership)) {
    return `Invalid ownership. Allowed values: ${Object.values(OWNERSHIP_TYPES).join(', ')}`;
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

export const validateUpdateHospital = (req) => {
  const { name, facility_type, ownership, latitude, longitude, is_active } = req.body;

  if (name !== undefined && !name.trim()) {
    return 'Hospital name cannot be empty.';
  }

  if (facility_type && !Object.values(FACILITY_TYPES).includes(facility_type)) {
    return `Invalid facility_type. Allowed types: ${Object.values(FACILITY_TYPES).join(', ')}`;
  }

  if (ownership && !Object.values(OWNERSHIP_TYPES).includes(ownership)) {
    return `Invalid ownership. Allowed values: ${Object.values(OWNERSHIP_TYPES).join(', ')}`;
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

  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return 'is_active must be a boolean.';
  }

  return null;
};

export const validateUpdateHospitalStatus = (req) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return 'is_active must be a boolean.';
  }
  return null;
};

export const validateNearbyHospitals = (req) => {
  const { lat, latitude, lng, longitude, radius, ambulance_id } = req.query;

  const resolvedLat = lat ?? latitude;
  const resolvedLng = lng ?? longitude;

  if (!resolvedLat && !resolvedLng && !ambulance_id) {
    return 'Either GPS coordinates (lat/lng) or ambulance_id must be provided.';
  }

  if (resolvedLat !== undefined && resolvedLat !== null) {
    const parsedLat = parseFloat(resolvedLat);
    if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
      return 'Latitude must be a valid number between -90 and 90.';
    }
  }

  if (resolvedLng !== undefined && resolvedLng !== null) {
    const parsedLng = parseFloat(resolvedLng);
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      return 'Longitude must be a valid number between -180 and 180.';
    }
  }

  if ((resolvedLat !== undefined && resolvedLng === undefined) || (resolvedLat === undefined && resolvedLng !== undefined)) {
    return 'Both latitude and longitude must be provided together.';
  }

  if (radius !== undefined && radius !== null) {
    const parsedRadius = parseFloat(radius);
    if (isNaN(parsedRadius) || parsedRadius <= 0 || parsedRadius > 100000) {
      return 'Radius must be a positive number up to 100,000 meters (100km).';
    }
  }

  return null;
};
