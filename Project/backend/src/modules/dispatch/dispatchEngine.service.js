import crypto from 'crypto';
import { Op } from 'sequelize';
import DISPATCH_CONFIG from './dispatchConfig.js';
import Ambulance, { isAmbulanceAvailable } from '../ambulances/ambulance.model.js';
import Hospital from '../hospitals/hospital.model.js';
import Emergency, { EMERGENCY_STATUS } from '../emergencies/emergency.model.js';
import DispatchRecommendation from './dispatchRecommendation.model.js';
import googleMapsService from '../hospitals/googleMaps.service.js';
import logger from '../../utils/logger.js';

class DispatchEngineService {
  /**
   * Generates a deterministic recommendation for an emergency incident
   */
  async evaluateCandidates(emergency, user = null, transaction = null) {
    const emgLat = emergency.latitude ? parseFloat(emergency.latitude) : null;
    const emgLng = emergency.longitude ? parseFloat(emergency.longitude) : null;
    const emergencyType = (emergency.emergency_type || 'OTHER').toUpperCase();
    const severity = parseInt(emergency.severity, 10) || 3;

    // 1. Fetch all active ambulances with their assigned station/hospital
    const ambulances = await Ambulance.findAll({
      where: { is_active: true },
      include: [
        {
          model: Hospital,
          as: 'currentHospital',
          attributes: ['HospitalID', 'HospitalName', 'Location', 'latitude', 'longitude']
        }
      ],
      transaction
    });

    // 2. Identify currently active emergency assignments to prevent conflicting assignments
    const activeEmergencies = await Emergency.findAll({
      where: {
        assigned_ambulance_id: { [Op.ne]: null },
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
      attributes: ['id', 'incident_code', 'assigned_ambulance_id'],
      transaction
    });

    const activeAssignedIds = new Set(
      activeEmergencies.map(e => e.assigned_ambulance_id).filter(Boolean)
    );

    // 3. Count available ambulances per station hospital for coverage impact analysis
    const hospitalAvailableCounts = {};
    for (const amb of ambulances) {
      if (
        isAmbulanceAvailable(amb.Status) &&
        !activeAssignedIds.has(amb.AmbulanceID) &&
        (amb.Fuel || 0) >= DISPATCH_CONFIG.thresholds.minimum_fuel_percent
      ) {
        const hospId = amb.CurrentHospitalID || 'UNSTATIONED';
        hospitalAvailableCounts[hospId] = (hospitalAvailableCounts[hospId] || 0) + 1;
      }
    }

    const eligibleCandidates = [];
    const excludedAmbulances = [];

    // 4. Filter and evaluate each ambulance
    for (const amb of ambulances) {
      const isAvailable = isAmbulanceAvailable(amb.Status);
      const isAssigned = activeAssignedIds.has(amb.AmbulanceID);
      const fuelLevel = amb.Fuel !== null && amb.Fuel !== undefined ? amb.Fuel : 0;
      const hasSufficientFuel = fuelLevel >= DISPATCH_CONFIG.thresholds.minimum_fuel_percent;

      // Resolve coordinates (live GPS preferred, station hospital fallback)
      let ambLat = amb.current_location_lat ? parseFloat(amb.current_location_lat) : null;
      let ambLng = amb.current_location_lng ? parseFloat(amb.current_location_lng) : null;
      let isLiveGps = Boolean(ambLat && ambLng);

      if ((!ambLat || !ambLng) && amb.currentHospital?.latitude && amb.currentHospital?.longitude) {
        ambLat = parseFloat(amb.currentHospital.latitude);
        ambLng = parseFloat(amb.currentHospital.longitude);
      }

      const hasCoordinates = Boolean(ambLat && ambLng);

      // Check exclusion criteria
      if (!isAvailable) {
        excludedAmbulances.push({
          ambulance_id: amb.AmbulanceID,
          fleet_code: amb.fleet_code || `AMB-${amb.AmbulanceID}`,
          status: amb.Status,
          fuel: fuelLevel,
          reason: `Ambulance is currently in '${amb.Status}' status (Not Available).`,
          code: 'STATUS_UNAVAILABLE'
        });
        continue;
      }

      if (isAssigned) {
        excludedAmbulances.push({
          ambulance_id: amb.AmbulanceID,
          fleet_code: amb.fleet_code || `AMB-${amb.AmbulanceID}`,
          status: amb.Status,
          fuel: fuelLevel,
          reason: 'Ambulance is currently assigned to another active emergency response.',
          code: 'ALREADY_ASSIGNED'
        });
        continue;
      }

      if (!hasSufficientFuel) {
        excludedAmbulances.push({
          ambulance_id: amb.AmbulanceID,
          fleet_code: amb.fleet_code || `AMB-${amb.AmbulanceID}`,
          status: amb.Status,
          fuel: fuelLevel,
          reason: `Insufficient fuel (${fuelLevel}%). Minimum required is ${DISPATCH_CONFIG.thresholds.minimum_fuel_percent}%.`,
          code: 'INSUFFICIENT_FUEL'
        });
        continue;
      }

      if (!hasCoordinates) {
        excludedAmbulances.push({
          ambulance_id: amb.AmbulanceID,
          fleet_code: amb.fleet_code || `AMB-${amb.AmbulanceID}`,
          status: amb.Status,
          fuel: fuelLevel,
          reason: 'Ambulance has no valid GPS or base station coordinates recorded.',
          code: 'MISSING_COORDINATES'
        });
        continue;
      }

      // Compute Travel Time / Route ETA
      let travelTimeMinutes = null;
      let distanceKm = null;
      let isEstimated = true;
      let routingFallback = false;

      if (emgLat && emgLng && ambLat && ambLng) {
        const haversine = googleMapsService.calculateHaversineDistanceAndTime(
          { lat: ambLat, lng: ambLng },
          { lat: emgLat, lng: emgLng },
          DISPATCH_CONFIG.thresholds.fallback_urban_speed_kmh
        );
        distanceKm = haversine.distance_km;
        // Total response duration = travel time + turnout/dispatch buffer
        travelTimeMinutes = Math.round((haversine.duration_minutes + DISPATCH_CONFIG.thresholds.dispatch_turnout_buffer_minutes) * 10) / 10;
        routingFallback = true;
      }

      // 5. Score Components (0 - 100 deterministic scale)

      // (a) Travel Time Score (Max 40)
      let travelTimeScore = 5;
      if (travelTimeMinutes !== null) {
        if (travelTimeMinutes <= 5) {
          travelTimeScore = 40;
        } else if (travelTimeMinutes <= 15) {
          travelTimeScore = 40 - ((travelTimeMinutes - 5) / 10) * 15; // 40 down to 25
        } else if (travelTimeMinutes <= 30) {
          travelTimeScore = 25 - ((travelTimeMinutes - 15) / 15) * 15; // 25 down to 10
        } else {
          travelTimeScore = 5;
        }
      }
      travelTimeScore = Math.max(5, Math.min(40, Math.round(travelTimeScore * 10) / 10));

      // (b) Vehicle Capability Match Score (Max 20)
      const vehicleType = (amb.vehicle_type || 'ADVANCED_LIFE_SUPPORT').toUpperCase();
      let capabilityScore = 10;
      const isCriticalOrLifeThreatening = severity >= 4 || ['CARDIAC', 'TRAUMA', 'RESPIRATORY', 'STROKE'].includes(emergencyType);

      if (isCriticalOrLifeThreatening) {
        if (vehicleType === 'ADVANCED_LIFE_SUPPORT') capabilityScore = 20;
        else if (vehicleType === 'BASIC_LIFE_SUPPORT') capabilityScore = 10;
        else capabilityScore = 5;
      } else if (severity === 3) {
        if (vehicleType === 'ADVANCED_LIFE_SUPPORT') capabilityScore = 20;
        else if (vehicleType === 'BASIC_LIFE_SUPPORT') capabilityScore = 18;
        else capabilityScore = 8;
      } else {
        // Low severity (1-2): prioritize BLS to conserve ALS for critical calls
        if (vehicleType === 'BASIC_LIFE_SUPPORT') capabilityScore = 20;
        else if (vehicleType === 'ADVANCED_LIFE_SUPPORT') capabilityScore = 14;
        else capabilityScore = 10;
      }

      // (c) Zone Coverage Impact Score (Max 20)
      const stationId = amb.CurrentHospitalID || 'UNSTATIONED';
      const availableInZone = hospitalAvailableCounts[stationId] || 0;
      const remainingAfterDispatch = Math.max(0, availableInZone - 1);
      let coverageImpact = 'UNKNOWN';
      let coverageScore = 10;

      if (stationId === 'UNSTATIONED') {
        coverageImpact = 'UNKNOWN';
        coverageScore = 10;
      } else if (remainingAfterDispatch >= 2) {
        coverageImpact = 'LOW';
        coverageScore = 20;
      } else if (remainingAfterDispatch === 1) {
        coverageImpact = 'MODERATE';
        coverageScore = 12;
      } else {
        coverageImpact = 'HIGH';
        coverageScore = 4;
      }

      // (d) Fuel Readiness Score (Max 10)
      let fuelScore = 2;
      if (fuelLevel >= 75) fuelScore = 10;
      else if (fuelLevel >= 50) fuelScore = 8;
      else if (fuelLevel >= 30) fuelScore = 5;
      else fuelScore = 2;

      // (e) Location Freshness & Confidence Score (Max 10)
      const updatedAt = amb.updated_at ? new Date(amb.updated_at).getTime() : 0;
      const ageMinutes = updatedAt ? Math.floor((Date.now() - updatedAt) / (60 * 1000)) : 999;
      let freshnessScore = 3;
      let freshnessCategory = 'BASE_STATION';

      if (isLiveGps) {
        if (ageMinutes <= DISPATCH_CONFIG.thresholds.location_fresh_threshold_minutes) {
          freshnessScore = 10;
          freshnessCategory = 'FRESH_GPS';
        } else if (ageMinutes <= DISPATCH_CONFIG.thresholds.location_stale_threshold_minutes) {
          freshnessScore = 7;
          freshnessCategory = 'MODERATE_GPS';
        } else {
          freshnessScore = 4;
          freshnessCategory = 'STALE_GPS';
        }
      } else {
        freshnessScore = 3;
        freshnessCategory = 'HOSPITAL_BASE';
      }

      // Total Score
      const totalScore = Math.round(
        (travelTimeScore + capabilityScore + coverageScore + fuelScore + freshnessScore) * 10
      ) / 10;

      // Formulate detailed explanation
      const explanationText = [
        `ETA ~${travelTimeMinutes !== null ? travelTimeMinutes + 'm' : 'N/A'} (${distanceKm !== null ? distanceKm + ' km' : 'dist unknown'})`,
        `Capability: ${vehicleType} (${capabilityScore}/20)`,
        `Coverage impact: ${coverageImpact} (${remainingAfterDispatch} remaining in sector)`,
        `Fuel: ${fuelLevel}% (${fuelScore}/10)`,
        `Location: ${freshnessCategory} (${freshnessScore}/10)`
      ].join(' | ');

      eligibleCandidates.push({
        ambulance_id: amb.AmbulanceID,
        fleet_code: amb.fleet_code || `AMB-${amb.AmbulanceID}`,
        registration_number: amb.registration_number,
        vehicle_type: vehicleType,
        ambulance_type: vehicleType,
        status: amb.Status,
        fuel: fuelLevel,
        fuel_percentage: fuelLevel,
        Fuel: fuelLevel,
        current_hospital_id: amb.CurrentHospitalID,
        current_hospital_name: amb.currentHospital?.HospitalName || 'Field/Mobile',
        latitude: ambLat,
        longitude: ambLng,
        is_live_gps: isLiveGps,
        location_freshness_category: freshnessCategory,
        location_age_minutes: ageMinutes,
        distance_km: distanceKm,
        travel_time_minutes: travelTimeMinutes,
        is_estimated: isEstimated,
        routing_fallback: routingFallback,
        total_score: totalScore,
        score: totalScore,
        score_breakdown: {
          travel_time: travelTimeScore,
          capability_match: capabilityScore,
          zone_coverage_impact: coverageScore,
          fuel_readiness: fuelScore,
          location_freshness: freshnessScore
        },
        coverage_impact: coverageImpact,
        remaining_zone_units: remainingAfterDispatch,
        explanation: explanationText
      });
    }

    // Sort eligible candidates descending by total score
    eligibleCandidates.sort((a, b) => b.total_score - a.total_score);

    // Mark rank
    eligibleCandidates.forEach((c, idx) => {
      c.rank = idx + 1;
      c.is_top_recommendation = idx === 0;
    });

    // 6. Hospital recommendations based on Phase 4 data
    const hospitals = await Hospital.findAll({
      where: { is_active: true },
      attributes: ['HospitalID', 'HospitalName', 'Location', 'latitude', 'longitude', 'facility_type'],
      transaction
    });

    const recommendedHospitals = hospitals.map(h => {
      let routeEstimate = null;
      if (emgLat && emgLng && h.latitude && h.longitude) {
        routeEstimate = googleMapsService.calculateHaversineDistanceAndTime(
          { lat: emgLat, lng: emgLng },
          { lat: parseFloat(h.latitude), lng: parseFloat(h.longitude) }
        );
      }
      return {
        hospital_id: h.HospitalID,
        name: h.HospitalName,
        address: h.Location,
        facility_type: h.facility_type,
        distance_km: routeEstimate ? routeEstimate.distance_km : null,
        travel_time_minutes: routeEstimate ? routeEstimate.duration_minutes : null,
        capacity_status: 'UNKNOWN', // Live EHR capacity feed not connected; clearly labeled per specs
        capabilities: [h.facility_type, 'Emergency Triage', 'Stabilization Unit']
      };
    });

    recommendedHospitals.sort((a, b) => (a.travel_time_minutes || 999) - (b.travel_time_minutes || 999));

    const topAmbulance = eligibleCandidates[0] || null;
    const topHospital = recommendedHospitals[0] || null;

    // 7. Persist recommendation record
    const recommendationUuid = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + DISPATCH_CONFIG.thresholds.recommendation_ttl_seconds * 1000);

    // Deactivate previous active recommendations for this emergency
    await DispatchRecommendation.update(
      { is_active: false },
      { where: { emergency_id: emergency.id, is_active: true }, transaction }
    );

    const savedRecord = await DispatchRecommendation.create({
      recommendation_uuid: recommendationUuid,
      emergency_id: emergency.id,
      generated_by_user_id: user?.id || null,
      scoring_weights_json: JSON.stringify(DISPATCH_CONFIG.weights),
      recommended_ambulance_id: topAmbulance?.ambulance_id || null,
      recommended_hospital_id: topHospital?.hospital_id || null,
      candidates_json: JSON.stringify(eligibleCandidates),
      exclusions_json: JSON.stringify(excludedAmbulances),
      expires_at: expiresAt,
      is_active: true
    }, { transaction });

    // Link recommendation to emergency
    emergency.current_recommendation_id = savedRecord.id;
    await emergency.save({ transaction });

    return {
      recommendation_id: savedRecord.id,
      recommendation_uuid: recommendationUuid,
      emergency_id: emergency.id,
      incident_code: emergency.incident_code,
      generated_at: savedRecord.created_at,
      expires_at: expiresAt,
      ttl_seconds: DISPATCH_CONFIG.thresholds.recommendation_ttl_seconds,
      is_expired: false,
      scoring_weights: DISPATCH_CONFIG.weights,
      metadata: DISPATCH_CONFIG.metadata,
      top_candidate: topAmbulance,
      candidates_count: eligibleCandidates.length,
      candidates: eligibleCandidates,
      exclusions_count: excludedAmbulances.length,
      exclusions: excludedAmbulances,
      recommended_hospitals: recommendedHospitals.slice(0, 5)
    };
  }

  /**
   * Revalidates a candidate ambulance immediately prior to assignment
   */
  async revalidateCandidate(ambulanceId, emergencyId, transaction = null) {
    const ambulance = await Ambulance.findByPk(ambulanceId, { transaction });
    if (!ambulance || !ambulance.is_active) {
      return { eligible: false, reason: `Ambulance #${ambulanceId} does not exist or is inactive.` };
    }

    if (!isAmbulanceAvailable(ambulance.Status)) {
      return { eligible: false, reason: `Ambulance #${ambulanceId} is no longer available (current status: '${ambulance.Status}').` };
    }

    if ((ambulance.Fuel || 0) < DISPATCH_CONFIG.thresholds.minimum_fuel_percent) {
      return { eligible: false, reason: `Ambulance #${ambulanceId} fuel dropped to ${ambulance.Fuel}%. Minimum required is ${DISPATCH_CONFIG.thresholds.minimum_fuel_percent}%.` };
    }

    // Verify no conflicting active assignment
    const conflicting = await Emergency.findOne({
      where: {
        assigned_ambulance_id: ambulanceId,
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
        id: { [Op.ne]: emergencyId }
      },
      transaction
    });

    if (conflicting) {
      return { eligible: false, reason: `Ambulance #${ambulanceId} has been concurrently assigned to incident #${conflicting.incident_code}.` };
    }

    return { eligible: true, ambulance };
  }
}

export const dispatchEngineService = new DispatchEngineService();
export default dispatchEngineService;
