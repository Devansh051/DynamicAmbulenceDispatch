/** Accept SQL decimal strings and numbers, never missing/coerced coordinates. */
const numeric = (value) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value));
export const hasValidCoordinates = (latitude, longitude) => numeric(latitude) && numeric(longitude) &&
  Number(latitude) >= -90 && Number(latitude) <= 90 && Number(longitude) >= -180 && Number(longitude) <= 180;
export default hasValidCoordinates;
