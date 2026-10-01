import { AMBULANCE_STATUS, VEHICLE_TYPES, normalizeAmbulanceStatus } from './ambulance.model.js';

export const validateCreateAmbulance = (req) => {
  const { current_hospital_id, vehicle_type, fuel_level, current_location_lat, current_location_lng } = req.body;

  if (!current_hospital_id || isNaN(parseInt(current_hospital_id, 10))) {
    return 'current_hospital_id is required and must be a valid hospital ID.';
  }

  if (vehicle_type && !Object.values(VEHICLE_TYPES).includes(vehicle_type)) {
    return `Invalid vehicle_type. Allowed types: ${Object.values(VEHICLE_TYPES).join(', ')}`;
  }

  if (fuel_level !== undefined) {
    const fuel = parseInt(fuel_level, 10);
    if (isNaN(fuel) || fuel < 0 || fuel > 100) {
      return 'fuel_level must be an integer between 0 and 100.';
    }
  }

  if (current_location_lat !== undefined && current_location_lat !== null) {
    const lat = parseFloat(current_location_lat);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'current_location_lat must be between -90 and 90.';
    }
  }

  if (current_location_lng !== undefined && current_location_lng !== null) {
    const lng = parseFloat(current_location_lng);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'current_location_lng must be between -180 and 180.';
    }
  }

  return null;
};

export const validateUpdateAmbulance = (req) => {
  const { vehicle_type, fuel_level, current_hospital_id, current_location_lat, current_location_lng, is_active } = req.body;

  if (current_hospital_id !== undefined && isNaN(parseInt(current_hospital_id, 10))) {
    return 'current_hospital_id must be a valid hospital ID.';
  }

  if (vehicle_type && !Object.values(VEHICLE_TYPES).includes(vehicle_type)) {
    return `Invalid vehicle_type. Allowed types: ${Object.values(VEHICLE_TYPES).join(', ')}`;
  }

  if (fuel_level !== undefined) {
    const fuel = parseInt(fuel_level, 10);
    if (isNaN(fuel) || fuel < 0 || fuel > 100) {
      return 'fuel_level must be an integer between 0 and 100.';
    }
  }

  if (current_location_lat !== undefined && current_location_lat !== null) {
    const lat = parseFloat(current_location_lat);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'current_location_lat must be between -90 and 90.';
    }
  }

  if (current_location_lng !== undefined && current_location_lng !== null) {
    const lng = parseFloat(current_location_lng);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'current_location_lng must be between -180 and 180.';
    }
  }

  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return 'is_active must be a boolean.';
  }

  return null;
};

export const validateUpdateAmbulanceStatus = (req) => {
  const { status, fuel_level, current_hospital_id } = req.body;

  if (!status) {
    return 'status is required.';
  }

  const normalizedStatus = normalizeAmbulanceStatus(status);
  if (!Object.values(AMBULANCE_STATUS).includes(normalizedStatus)) {
    return `Invalid status. Allowed values: ${Object.values(AMBULANCE_STATUS).join(', ')}`;
  }

  if (fuel_level !== undefined) {
    const fuel = parseInt(fuel_level, 10);
    if (isNaN(fuel) || fuel < 0 || fuel > 100) {
      return 'fuel_level must be an integer between 0 and 100.';
    }
  }

  if (current_hospital_id !== undefined && isNaN(parseInt(current_hospital_id, 10))) {
    return 'current_hospital_id must be an integer.';
  }

  return null;
};
