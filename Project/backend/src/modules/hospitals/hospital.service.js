import { Op } from 'sequelize';
import Hospital, { DATA_SOURCES } from './hospital.model.js';
import HospitalFeedback from './hospitalFeedback.model.js';
import Ambulance from '../ambulances/ambulance.model.js';
import AuthAuditLog from '../audit/audit.model.js';
import sequelize from '../../config/database.js';
import logger from '../../utils/logger.js';
import googleMapsService from './googleMaps.service.js';
import fleetTracker from '../fleet/fleetTracker.service.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';

class HospitalService {
  async listHospitals({
    page = 1,
    limit = 20,
    search = '',
    facility_type,
    ownership,
    is_active,
    city,
    sortBy = 'HospitalID',
    sortOrder = 'ASC'
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const where = {};

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      const searchNum = parseInt(search.trim(), 10);
      const orClauses = [
        { HospitalName: { [Op.like]: q } },
        { Location: { [Op.like]: q } },
        { address: { [Op.like]: q } },
        { city: { [Op.like]: q } }
      ];
      if (!isNaN(searchNum)) {
        orClauses.push({ HospitalID: searchNum });
        orClauses.push({ legacy_id: searchNum });
      }
      where[Op.or] = orClauses;
    }

    if (facility_type) {
      where.facility_type = facility_type;
    }

    if (ownership) {
      where.ownership = ownership;
    }

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === 1;
    }

    if (city) {
      where.city = { [Op.like]: `%${city.trim()}%` };
    }

    const allowedSortFields = ['HospitalID', 'HospitalName', 'city', 'facility_type', 'ownership', 'is_active', 'created_at'];
    const orderColumn = allowedSortFields.includes(sortBy) ? sortBy : 'HospitalID';
    const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { count, rows } = await Hospital.findAndCountAll({
      where,
      include: [
        {
          model: Ambulance,
          as: 'stationedAmbulances',
          attributes: ['AmbulanceID', 'fleet_code', 'Status', 'Fuel']
        }
      ],
      order: [[orderColumn, orderDir]],
      limit: limitNum,
      offset,
      distinct: true
    });

    return {
      hospitals: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    };
  }

  async getHospitalById(id) {
    const hospital = await Hospital.findByPk(id, {
      include: [
        {
          model: Ambulance,
          as: 'stationedAmbulances',
          attributes: ['AmbulanceID', 'fleet_code', 'Status', 'Fuel', 'vehicle_type']
        },
        {
          model: HospitalFeedback,
          as: 'feedbacks',
          limit: 10,
          order: [['CreatedAt', 'DESC']]
        }
      ]
    });

    if (!hospital) {
      const err = new Error(`Hospital with ID '${id}' not found`);
      err.status = 404;
      err.code = 'HOSPITAL_NOT_FOUND';
      throw err;
    }

    // Compute average feedback rating if feedbacks exist
    let avgRating = 0;
    if (hospital.feedbacks && hospital.feedbacks.length > 0) {
      const total = hospital.feedbacks.reduce((sum, f) => sum + f.Rating, 0);
      avgRating = Number((total / hospital.feedbacks.length).toFixed(1));
    }

    const data = hospital.toJSON();
    data.average_rating = avgRating;
    return data;
  }

  async createHospital(data, user) {
    const {
      name,
      address,
      city = 'Bengaluru',
      state = 'Karnataka',
      postal_code,
      facility_type,
      ownership,
      phone,
      latitude,
      longitude
    } = data;

    // Check unique HospitalName
    const existing = await Hospital.findOne({ where: { HospitalName: name.trim() } });
    if (existing) {
      const err = new Error(`Hospital with name '${name}' already exists.`);
      err.status = 409;
      err.code = 'DUPLICATE_HOSPITAL_NAME';
      throw err;
    }

    const newHospital = await Hospital.create({
      HospitalName: name.trim(),
      Location: address ? address.substring(0, 100) : city,
      address: address || null,
      city: city.trim(),
      state: state.trim(),
      postal_code: postal_code || null,
      facility_type: facility_type || undefined,
      ownership: ownership || undefined,
      phone: phone || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      is_active: true,
      data_source: DATA_SOURCES.MANUAL
    });

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'HOSPITAL_CREATED',
      details: `Created hospital #${newHospital.HospitalID} (${newHospital.HospitalName}) by ${user.name}`
    });

    return this.getHospitalById(newHospital.HospitalID);
  }

  async updateHospital(id, data, user) {
    const hospital = await Hospital.findByPk(id);
    if (!hospital) {
      const err = new Error(`Hospital with ID '${id}' not found`);
      err.status = 404;
      err.code = 'HOSPITAL_NOT_FOUND';
      throw err;
    }

    const {
      name,
      address,
      city,
      state,
      postal_code,
      facility_type,
      ownership,
      phone,
      latitude,
      longitude,
      is_active
    } = data;

    if (name && name.trim() !== hospital.HospitalName) {
      const existing = await Hospital.findOne({
        where: { HospitalName: name.trim(), HospitalID: { [Op.ne]: hospital.HospitalID } }
      });
      if (existing) {
        const err = new Error(`Hospital with name '${name}' already exists.`);
        err.status = 409;
        err.code = 'DUPLICATE_HOSPITAL_NAME';
        throw err;
      }
      hospital.HospitalName = name.trim();
    }

    if (address !== undefined) {
      hospital.address = address;
      hospital.Location = address ? address.substring(0, 100) : hospital.Location;
    }
    if (city !== undefined) hospital.city = city.trim();
    if (state !== undefined) hospital.state = state.trim();
    if (postal_code !== undefined) hospital.postal_code = postal_code;
    if (facility_type !== undefined) hospital.facility_type = facility_type;
    if (ownership !== undefined) hospital.ownership = ownership;
    if (phone !== undefined) hospital.phone = phone;
    if (latitude !== undefined) hospital.latitude = latitude;
    if (longitude !== undefined) hospital.longitude = longitude;
    if (is_active !== undefined) hospital.is_active = is_active;

    await hospital.save();

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'HOSPITAL_UPDATED',
      details: `Updated hospital #${hospital.HospitalID} by ${user.name}`
    });

    return this.getHospitalById(hospital.HospitalID);
  }

  async updateHospitalStatus(id, isActive, user) {
    const hospital = await Hospital.findByPk(id);
    if (!hospital) {
      const err = new Error(`Hospital with ID '${id}' not found`);
      err.status = 404;
      err.code = 'HOSPITAL_NOT_FOUND';
      throw err;
    }

    hospital.is_active = Boolean(isActive);
    await hospital.save();

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'HOSPITAL_STATUS_CHANGED',
      details: `Hospital #${hospital.HospitalID} active status set to ${hospital.is_active} by ${user.name}`
    });

    return this.getHospitalById(hospital.HospitalID);
  }

  /**
   * Dynamic nearby hospital discovery based on ambulance GPS coordinates
   * Combines local database geospatial matching + Google Places discovery + Google Routes travel times
   */
  async findNearbyHospitals({ latitude, longitude, radius = 15000, ambulance_id } = {}) {
    let lat = latitude !== undefined && latitude !== '' ? parseFloat(latitude) : NaN;
    let lng = longitude !== undefined && longitude !== '' ? parseFloat(longitude) : NaN;
    const searchRadius = Math.min(50000, Math.max(500, parseInt(radius, 10) || 15000));

    // If ambulance_id is provided, resolve coordinates from ambulance
    let ambulanceRecord = null;
    let isAmbulanceGpsStale = false;
    let locationTimestamp = null;
    let originType = 'COORDINATES';

    if (ambulance_id) {
      ambulanceRecord = await Ambulance.findByPk(ambulance_id);
      if (ambulanceRecord) {
        const live = (await fleetTracker.getLiveStates([ambulanceRecord.AmbulanceID])).get(ambulanceRecord.AmbulanceID);
        if (live?.health === 'ONLINE' && hasValidCoordinates(live.latitude, live.longitude)) {
          lat = Number(live.latitude); lng = Number(live.longitude);
          originType = 'AMBULANCE_LIVE_GPS'; locationTimestamp = live.last_gps_at;
        } else {
          isAmbulanceGpsStale = true;
          const stationHospital = ambulanceRecord.CurrentHospitalID ? await Hospital.findByPk(ambulanceRecord.CurrentHospitalID) : null;
          if (hasValidCoordinates(stationHospital?.latitude, stationHospital?.longitude)) {
            lat = Number(stationHospital.latitude); lng = Number(stationHospital.longitude);
            originType = 'AMBULANCE_STATION';
          } else { lat = NaN; lng = NaN; }
        }
      }
    }

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      const err = new Error('Valid GPS coordinates (latitude between -90 and 90, longitude between -180 and 180) are required for nearby discovery.');
      err.status = 400;
      err.code = 'INVALID_COORDINATES';
      throw err;
    }

    // 1. Query local database using Haversine distance in SQL
    const [localResults] = await sequelize.query(`
      SELECT
        HospitalID,
        HospitalName,
        Location,
        address,
        city,
        district,
        state,
        postal_code,
        latitude,
        longitude,
        facility_type,
        ownership,
        phone,
        is_active,
        data_source,
        verification_status,
        data_freshness,
        government_id,
        google_place_id,
        (6371000 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS((latitude - :lat) / 2.0)), 2) +
          COS(RADIANS(:lat)) * COS(RADIANS(latitude)) *
          POWER(SIN(RADIANS((longitude - :lng) / 2.0)), 2)
        ))) AS distance_meters
      FROM dbo.Hospitals
      WHERE is_active = 1
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY distance_meters ASC
    `, {
      replacements: { lat, lng }
    });

    const localCandidates = (localResults || [])
      .filter(h => h.distance_meters <= searchRadius)
      .map(h => ({
        id: h.HospitalID,
        HospitalID: h.HospitalID,
        name: h.HospitalName,
        HospitalName: h.HospitalName,
        address: h.address || h.Location || `${h.city}, ${h.state}`,
        city: h.city,
        district: h.district,
        state: h.state,
        postal_code: h.postal_code,
        latitude: parseFloat(h.latitude),
        longitude: parseFloat(h.longitude),
        facility_type: h.facility_type,
        ownership: h.ownership,
        phone: h.phone,
        government_id: h.government_id,
        google_place_id: h.google_place_id,
        data_source: h.data_source,
        verification_status: h.verification_status || 'VERIFIED',
        data_freshness: h.data_freshness || 'FRESH',
        straight_distance_meters: Math.round(h.distance_meters)
      }));

    // 2. Discover nearby places from Google Places API (New)
    let placesCandidates = [];
    try {
      placesCandidates = await googleMapsService.searchNearbyHospitals({
        latitude: lat,
        longitude: lng,
        radiusMeters: searchRadius
      });
    } catch (err) {
      logger.warn(`[HospitalService] Google Places search encountered error: ${err.message}`);
    }

    // 3. Match and Deduplicate
    const unifiedCandidates = [...localCandidates];

    for (const place of placesCandidates) {
      let matchIndex = -1;

      // Check match by google_place_id
      if (place.google_place_id) {
        matchIndex = unifiedCandidates.findIndex(c => c.google_place_id === place.google_place_id);
      }

      // If no match by ID, check proximity (< 250m) and exact name similarity (do not merge ambiguous matches)
      if (matchIndex === -1 && hasValidCoordinates(place.latitude, place.longitude)) {
        const placeNorm = place.name.toLowerCase().replace(/[^\w\s]/gi, '').trim();
        const candidateMatches = [];

        unifiedCandidates.forEach((c, idx) => {
          if (hasValidCoordinates(c.latitude, c.longitude)) {
            const dist = googleMapsService.calculateHaversineDistance(c.latitude, c.longitude, place.latitude, place.longitude);
            if (dist < 250) {
              const candNorm = (c.name || c.HospitalName || '').toLowerCase().replace(/[^\w\s]/gi, '').trim();
              if (candNorm === placeNorm && (!c.google_place_id || !place.google_place_id || c.google_place_id === place.google_place_id)) {
                candidateMatches.push(idx);
              }
            }
          }
        });

        // Only merge if exactly 1 unambiguous match
        if (candidateMatches.length === 1) {
          matchIndex = candidateMatches[0];
        }
      }

      if (matchIndex !== -1) {
        // Matched across both sources!
        unifiedCandidates[matchIndex].data_source = 'MATCHED_BOTH';
        unifiedCandidates[matchIndex].verification_status = 'CROSS_MATCHED';
        if (!unifiedCandidates[matchIndex].google_place_id && place.google_place_id) {
          unifiedCandidates[matchIndex].google_place_id = place.google_place_id;
        }
        if (!unifiedCandidates[matchIndex].phone && place.phone) {
          unifiedCandidates[matchIndex].phone = place.phone;
        }
        if (place.rating) {
          unifiedCandidates[matchIndex].google_rating = place.rating;
        }
      } else {
        // New discovery from Google Places
        unifiedCandidates.push({
          id: `gp_${place.google_place_id}`,
          HospitalID: null,
          name: place.name,
          HospitalName: place.name,
          address: place.address,
          city: 'Bengaluru',
          state: 'Karnataka',
          latitude: place.latitude,
          longitude: place.longitude,
          facility_type: place.facility_type || 'GENERAL_HOSPITAL',
          phone: place.phone,
          google_place_id: place.google_place_id,
          google_rating: place.rating,
          data_source: 'GOOGLE_PLACES',
          verification_status: 'UNVERIFIED',
          data_freshness: 'FRESH',
          straight_distance_meters: place.distance_meters
        });
      }
    }

    // 4. Calculate driving routes and estimated travel time via Google Routes API (for top 15 closest)
    unifiedCandidates.sort((a, b) => (a.straight_distance_meters || 0) - (b.straight_distance_meters || 0));

    const topCandidates = unifiedCandidates.slice(0, 15);
    const routedCandidates = await Promise.all(
      topCandidates.map(async (c) => {
        try {
          const route = await googleMapsService.computeDrivingRoute({
            originLat: lat,
            originLng: lng,
            destLat: c.latitude,
            destLng: c.longitude
          });
          return {
            ...c,
            route_distance_meters: route.distanceMeters,
            route_distance_km: route.distanceKm,
            distance_km: route.distanceKm,
            estimated_duration_seconds: route.durationSeconds,
            formatted_duration: route.formattedDuration,
            duration_minutes: Math.round(route.durationSeconds / 60),
            route_polyline: route.routePolyline,
            is_route_estimated: route.isEstimated
          };
        } catch {
          const fallback = googleMapsService.estimateRouteFallback(lat, lng, c.latitude, c.longitude);
          return {
            ...c,
            route_distance_meters: fallback.distanceMeters,
            route_distance_km: fallback.distanceKm,
            distance_km: fallback.distanceKm,
            estimated_duration_seconds: fallback.durationSeconds,
            formatted_duration: fallback.formattedDuration,
            duration_minutes: Math.round(fallback.durationSeconds / 60),
            route_polyline: null,
            is_route_estimated: true
          };
        }
      })
    );

    // Final sorting by estimated travel time / distance
    routedCandidates.sort((a, b) => {
      const durA = a.estimated_duration_seconds || a.straight_distance_meters || 0;
      const durB = b.estimated_duration_seconds || b.straight_distance_meters || 0;
      return durA - durB;
    });

    return {
      origin: {
        latitude: lat,
        longitude: lng,
        ambulance_id: ambulance_id ? parseInt(ambulance_id, 10) : null,
        fleet_code: ambulanceRecord?.fleet_code || null,
        origin_type: originType,
        location_timestamp: locationTimestamp,
        is_stale: isAmbulanceGpsStale
      },
      search_center: {
        latitude: lat,
        longitude: lng,
        origin_type: originType,
        location_timestamp: locationTimestamp,
        is_stale: isAmbulanceGpsStale
      },
      ambulance: ambulanceRecord
        ? {
            AmbulanceID: ambulanceRecord.AmbulanceID,
            fleet_code: ambulanceRecord.fleet_code,
            Status: ambulanceRecord.Status,
            location_timestamp: locationTimestamp,
            is_stale: isAmbulanceGpsStale
          }
        : null,
      search_radius_meters: searchRadius,
      search_radius_km: Number((searchRadius / 1000).toFixed(1)),
      total_candidates: routedCandidates.length,
      sources_summary: {
        local_database: routedCandidates.filter(c => c.data_source !== 'GOOGLE_PLACES').length,
        google_places: routedCandidates.filter(c => c.data_source === 'GOOGLE_PLACES').length,
        matched_both: routedCandidates.filter(c => c.data_source === 'MATCHED_BOTH').length
      },
      candidates: routedCandidates,
      hospitals: routedCandidates
    };
  }
}

export const hospitalService = new HospitalService();
export default hospitalService;
