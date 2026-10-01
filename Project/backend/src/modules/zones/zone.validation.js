export const validateCreateZone = (req) => {
  const { zone_code, name, center_latitude, center_longitude, radius_km } = req.body;

  if (!zone_code || !zone_code.trim()) {
    return 'zone_code is required.';
  }

  if (!name || !name.trim()) {
    return 'Zone name is required.';
  }

  if (center_latitude !== undefined && center_latitude !== null) {
    const lat = parseFloat(center_latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'center_latitude must be between -90 and 90.';
    }
  }

  if (center_longitude !== undefined && center_longitude !== null) {
    const lng = parseFloat(center_longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'center_longitude must be between -180 and 180.';
    }
  }

  if (radius_km !== undefined && radius_km !== null) {
    const rad = parseFloat(radius_km);
    if (isNaN(rad) || rad <= 0 || rad > 500) {
      return 'radius_km must be a positive number up to 500 km.';
    }
  }

  return null;
};

export const validateUpdateZone = (req) => {
  const { zone_code, name, center_latitude, center_longitude, radius_km, is_active } = req.body;

  if (zone_code !== undefined && !zone_code.trim()) {
    return 'zone_code cannot be empty.';
  }

  if (name !== undefined && !name.trim()) {
    return 'Zone name cannot be empty.';
  }

  if (center_latitude !== undefined && center_latitude !== null) {
    const lat = parseFloat(center_latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      return 'center_latitude must be between -90 and 90.';
    }
  }

  if (center_longitude !== undefined && center_longitude !== null) {
    const lng = parseFloat(center_longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      return 'center_longitude must be between -180 and 180.';
    }
  }

  if (radius_km !== undefined && radius_km !== null) {
    const rad = parseFloat(radius_km);
    if (isNaN(rad) || rad <= 0 || rad > 500) {
      return 'radius_km must be a positive number up to 500 km.';
    }
  }

  if (is_active !== undefined && typeof is_active !== 'boolean') {
    return 'is_active must be a boolean.';
  }

  return null;
};

export const validateUpdateZoneStatus = (req) => {
  const { is_active } = req.body;
  if (typeof is_active !== 'boolean') {
    return 'is_active must be a boolean.';
  }
  return null;
};
