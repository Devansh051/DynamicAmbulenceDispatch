import '../../config/env.js';
/**
 * Phase 5 Ambulance Dispatch Recommendation Engine Configuration
 * Configurable scoring weights, freshness thresholds, and operational constraints.
 * Safe defaults are provided with environment overrides and validation.
 */

export const DISPATCH_CONFIG = Object.freeze({
  // Scoring Weights (Must sum to 100)
  weights: {
    travel_time: parseInt(process.env.DISPATCH_WEIGHT_TRAVEL_TIME || '40', 10),
    capability_match: parseInt(process.env.DISPATCH_WEIGHT_CAPABILITY || '20', 10),
    zone_coverage_impact: parseInt(process.env.DISPATCH_WEIGHT_ZONE_COVERAGE || '20', 10),
    fuel_readiness: parseInt(process.env.DISPATCH_WEIGHT_FUEL || '10', 10),
    location_freshness: parseInt(process.env.DISPATCH_WEIGHT_FRESHNESS || '10', 10)
  },

  // Operational Constraints and Thresholds
  thresholds: {
    // Recommendation expiration TTL in seconds (default 5 minutes = 300s)
    recommendation_ttl_seconds: parseInt(process.env.DISPATCH_RECOMMENDATION_TTL_SECONDS || '300', 10),
    // Minimum fuel required for emergency assignment (%)
    minimum_fuel_percent: parseInt(process.env.DISPATCH_MIN_FUEL_PERCENT || '15', 10),
    // Location age in minutes to consider fresh vs stale
    location_fresh_threshold_minutes: parseInt(process.env.DISPATCH_LOCATION_FRESH_MINUTES || '5', 10),
    location_stale_threshold_minutes: parseInt(process.env.DISPATCH_LOCATION_STALE_MINUTES || '60', 10),
    // Default estimated urban driving speed (km/h) for Haversine fallback
    fallback_urban_speed_kmh: parseFloat(process.env.DISPATCH_FALLBACK_SPEED_KMH || '35.0'),
    // Dispatch prep / turnout buffer in minutes added to route time
    dispatch_turnout_buffer_minutes: parseFloat(process.env.DISPATCH_TURNOUT_BUFFER_MINUTES || '2.0'),
    // Minimum ambulances in a zone before coverage impact is marked HIGH
    zone_low_reserve_threshold: parseInt(process.env.DISPATCH_ZONE_LOW_RESERVE || '1', 10),
    require_online_fleet_state: ['true', '1', 'yes'].includes(String(process.env.FLEET_DISPATCH_REQUIRE_ONLINE || '').toLowerCase())
  },

  // Scoring Formula Documentation & Limitations
  metadata: {
    formula_version: '1.0.0-phase5',
    description: 'Deterministic rule-based multi-factor EMS dispatch scoring engine',
    disclaimer: 'Dispatch scores provide decision support and do not guarantee clinical outcomes or exact arrival times.',
    factors: [
      { name: 'travel_time', max_points: 40, description: 'Route travel duration; decayed linearly between 5m and 30m' },
      { name: 'capability_match', max_points: 20, description: 'Matches vehicle medical capabilities (ALS vs BLS) to incident severity' },
      { name: 'zone_coverage_impact', max_points: 20, description: 'Evaluates remaining emergency response capacity in the station zone' },
      { name: 'fuel_readiness', max_points: 10, description: 'Assesses fuel reserve adequacy for immediate dispatch' },
      { name: 'location_freshness', max_points: 10, description: 'Confidence in current coordinates vs stale or base station locations' }
    ]
  }
});

/**
 * Validates that scoring weights sum to 100
 */
export function validateDispatchConfig(config = DISPATCH_CONFIG) {
  const sum = Object.values(config.weights).reduce((acc, w) => acc + w, 0);
  if (Object.values(config.weights).some((weight) => !Number.isFinite(weight) || weight < 0) || sum !== 100) {
    throw new Error(`Dispatch scoring weights must sum to exactly 100. Current sum: ${sum}`);
  }
  const positive = ['recommendation_ttl_seconds', 'fallback_urban_speed_kmh', 'location_fresh_threshold_minutes', 'location_stale_threshold_minutes'];
  if (positive.some((name) => !Number.isFinite(config.thresholds[name]) || config.thresholds[name] <= 0) ||
      !Number.isFinite(config.thresholds.minimum_fuel_percent) || config.thresholds.minimum_fuel_percent < 0 || config.thresholds.minimum_fuel_percent > 100) {
    throw new Error('Invalid dispatch thresholds.');
  }
  return true;
}

// Validate on startup
validateDispatchConfig();
for (const factor of DISPATCH_CONFIG.metadata.factors) factor.max_points = DISPATCH_CONFIG.weights[factor.name];

export default DISPATCH_CONFIG;
