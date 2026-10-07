import axios from 'axios';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import { hasValidCoordinates } from '../../utils/coordinates.js';

class GoogleMapsService {
  constructor() {
    this.apiKey = env.googleMaps.apiKey;
    this.defaultRadius = env.googleMaps.searchRadiusMeters || 15000;
    this.region = env.googleMaps.region || 'in';
    this.placesUrl = 'https://places.googleapis.com/v1/places:searchNearby';
    this.routesUrl = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    this.geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json';
    this.timeoutMs = 8000;

    // In-memory cache for dynamic nearby discoveries (5-minute TTL)
    this.cache = new Map();
    this.cacheTtlMs = 5 * 60 * 1000;

    // Temporary backoff when Google API key encounters quota exhaustion, billing or permission errors
    this.placesBlockedUntil = 0;
    this.routesBlockedUntil = 0;
  }

  /**
   * Redact any API key parameters from error messages to protect credentials
   */
  sanitizeError(error) {
    if (!error) return 'Unknown error';
    let msg = String(error.response?.data?.error?.message || error.message || error);
    for (const key of [this.apiKey, env.googleMaps.apiKey]) {
      if (key) msg = msg.split(key).join('[REDACTED_API_KEY]');
    }
    return msg.replace(/(key|api[-_]?key)=[^&\s]+/gi, '$1=[REDACTED_API_KEY]');
  }

  /**
   * Bounded retry helper for transient network or 5xx server failures
   */
  async executeWithRetry(fn, { maxRetries = 2, delayMs = 300, operation = 'External API' } = {}) {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        const status = err.response?.status;
        const isClientError = status && status >= 400 && status < 500;
        // Do not retry 4xx errors (client errors, bad request, quota, forbidden)
        if (isClientError || attempt > maxRetries) {
          throw err;
        }
        const wait = delayMs * Math.pow(2, attempt - 1);
        logger.warn(`[GoogleMapsService] ${operation} attempt ${attempt} failed (${this.sanitizeError(err)}). Retrying in ${wait}ms...`);
        await new Promise((res) => setTimeout(res, wait));
      }
    }
  }

  /**
   * Helper to compute Haversine distance between two GPS coordinates in meters
   */
  calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }

  /**
   * Fallback estimation of driving route distance & duration when Google Routes API is unavailable
   */
  estimateRouteFallback(originLat, originLng, destLat, destLng, speedKph = 35) {
    const straightDistance = this.calculateHaversineDistance(originLat, originLng, destLat, destLng);
    // Typical urban detour index is ~1.3x straight-line distance
    const roadDistanceMeters = Math.round(straightDistance * 1.3);
    // Average EMS speed in urban traffic ~35 km/h = 9.72 m/s
    const durationSeconds = Math.max(60, Math.round(roadDistanceMeters / ((Number(speedKph) > 0 ? Number(speedKph) : 35) / 3.6)));
    const durationMinutes = Math.round(durationSeconds / 60);

    return {
      distanceMeters: roadDistanceMeters,
      distanceKm: Number((roadDistanceMeters / 1000).toFixed(2)),
      distance_meters: roadDistanceMeters,
      distance_km: Number((roadDistanceMeters / 1000).toFixed(2)),
      durationSeconds,
      duration_seconds: durationSeconds,
      duration_minutes: durationMinutes,
      formattedDuration: `${durationMinutes} mins`,
      formatted_duration: `${durationMinutes} mins`,
      isEstimated: true,
      routePolyline: null
    };
  }

  calculateHaversineDistanceAndTime(origin, destination, speedKph = 35) {
    const oLat = origin.latitude ?? origin.lat;
    const oLng = origin.longitude ?? origin.lng;
    const dLat = destination.latitude ?? destination.lat;
    const dLng = destination.longitude ?? destination.lng;
    return this.estimateRouteFallback(oLat, oLng, dLat, dLng, speedKph);
  }

  /**
   * Search for nearby hospitals using Google Places API (New)
   */
  async searchNearbyHospitals({ latitude, longitude, radiusMeters } = {}) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const radius = parseInt(radiusMeters, 10) || this.defaultRadius;

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      throw new Error(`Invalid GPS coordinates: lat=${latitude}, lng=${longitude}`);
    }

    const apiKey = env.googleMaps.apiKey || this.apiKey;
    if (!apiKey) {
      logger.info('[GoogleMapsService] No GOOGLE_MAPS_API_KEY configured. Skipping Google Places discovery.');
      return [];
    }

    if (this.placesBlockedUntil && Date.now() < this.placesBlockedUntil) {
      logger.info('[GoogleMapsService] Places API currently in backoff window. Skipping external request.');
      return [];
    }

    // Check cache
    const cacheKey = `places:${lat.toFixed(4)}:${lng.toFixed(4)}:${radius}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      logger.info(`[GoogleMapsService] Returning ${cached.results.length} cached nearby places for ${cacheKey}`);
      return cached.results;
    }

    try {
      logger.info(`[GoogleMapsService] Querying Google Places API (New) around ${lat}, ${lng} (radius: ${radius}m)...`);

      const response = await this.executeWithRetry(
        () =>
          axios.post(
            this.placesUrl,
            {
              includedTypes: ['hospital'],
              maxResultCount: 30,
              locationRestriction: {
                circle: {
                  center: { latitude: lat, longitude: lng },
                  radius: Math.min(50000, Math.max(500, radius))
                }
              }
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask':
                  'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.nationalPhoneNumber,places.rating,places.userRatingCount'
              },
              timeout: this.timeoutMs
            }
          ),
        { operation: 'Google Places API (New)' }
      );

      const rawPlaces = response.data?.places || [];
      const normalized = rawPlaces.map((p) => this.normalizePlaceResult(p, lat, lng));

      this.cache.set(cacheKey, { timestamp: Date.now(), results: normalized });
      logger.info(`[GoogleMapsService] Discovered ${normalized.length} nearby hospitals from Google Places.`);
      return normalized;
    } catch (err) {
      const sanitizedMsg = this.sanitizeError(err);
      logger.warn(`[GoogleMapsService] Places API (New) search failed: ${sanitizedMsg}. Attempting classic Places API fallback...`);

      const classicPlaces = await this.searchNearbyPlacesClassic({
        latitude: lat,
        longitude: lng,
        radiusMeters: radius,
        apiKey
      });

      if (classicPlaces.length > 0) {
        this.cache.set(cacheKey, { timestamp: Date.now(), results: classicPlaces });
        logger.info(`[GoogleMapsService] Discovered ${classicPlaces.length} nearby hospitals from Classic Google Places API.`);
        return classicPlaces;
      }

      if (
        err.response?.status === 403 ||
        err.response?.status === 429 ||
        err.response?.status === 400 ||
        String(sanitizedMsg).includes('blocked') ||
        String(sanitizedMsg).includes('Billing') ||
        String(sanitizedMsg).includes('RESOURCE_EXHAUSTED')
      ) {
        this.placesBlockedUntil = Date.now() + 5 * 60 * 1000;
        logger.warn('[GoogleMapsService] Google Places API backoff triggered for 5 minutes due to permission/quota/billing issue.');
      }
      return [];
    }
  }

  /**
   * Fallback using Google Maps Classic Places Nearby Search API
   */
  async searchNearbyPlacesClassic({ latitude, longitude, radiusMeters, apiKey } = {}) {
    try {
      const url = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';
      const response = await this.executeWithRetry(
        () =>
          axios.get(url, {
            params: {
              location: `${latitude},${longitude}`,
              radius: Math.min(50000, Math.max(500, radiusMeters || this.defaultRadius)),
              type: 'hospital',
              key: apiKey
            },
            timeout: this.timeoutMs
          }),
        { operation: 'Classic Places Nearby API' }
      );

      if (response.data?.status === 'OK') {
        const rawPlaces = response.data.results || [];
        return rawPlaces.map((p) => {
          const placeLat = p.geometry?.location?.lat;
          const placeLng = p.geometry?.location?.lng;
          const distMeters = this.calculateHaversineDistance(latitude, longitude, placeLat, placeLng);
          return {
            google_place_id: p.place_id,
            name: p.name || 'Hospital',
            address: p.vicinity || 'Bengaluru, Karnataka',
            latitude: placeLat,
            longitude: placeLng,
            phone: null,
            facility_type: 'GENERAL_HOSPITAL',
            rating: p.rating || null,
            user_ratings_total: p.user_ratings_total || 0,
            distance_meters: distMeters,
            data_source: 'GOOGLE_PLACES',
            verification_status: 'UNVERIFIED',
            data_freshness: 'FRESH'
          };
        });
      }
      return [];
    } catch (e) {
      logger.warn(`[GoogleMapsService] Classic Places API fallback failed: ${this.sanitizeError(e)}`);
      return [];
    }
  }

  /**
   * Safely normalize place results from Google Places API (New) or classic structures
   */
  normalizePlaceResult(p, originLat = null, originLng = null) {
    if (!p) return null;
    const placeLat = p.location?.latitude ?? p.geometry?.location?.lat ?? p.latitude;
    const placeLng = p.location?.longitude ?? p.geometry?.location?.lng ?? p.longitude;
    const distMeters = (originLat != null && originLng != null && placeLat != null && placeLng != null)
      ? this.calculateHaversineDistance(originLat, originLng, placeLat, placeLng)
      : null;

    return {
      google_place_id: p.id || p.place_id,
      name: p.displayName?.text || p.name || 'Hospital',
      address: p.formattedAddress || p.vicinity || 'Bengaluru, Karnataka',
      latitude: placeLat,
      longitude: placeLng,
      phone: p.nationalPhoneNumber || p.formatted_phone_number || null,
      facility_type: 'GENERAL_HOSPITAL',
      rating: p.rating || null,
      user_ratings_total: p.userRatingCount || p.user_ratings_total || 0,
      distance_meters: distMeters,
      data_source: 'GOOGLE_PLACES',
      verification_status: 'UNVERIFIED',
      data_freshness: 'FRESH'
    };
  }

  /**
   * Compute driving route, distance and estimated travel time using Google Routes API
   */
  async computeDrivingRoute({ originLat, originLng, destLat, destLng } = {}) {
    const oLat = parseFloat(originLat);
    const oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    if (
      isNaN(oLat) ||
      isNaN(oLng) ||
      isNaN(dLat) ||
      isNaN(dLng) ||
      oLat < -90 ||
      oLat > 90 ||
      dLat < -90 ||
      dLat > 90 ||
      oLng < -180 ||
      oLng > 180 ||
      dLng < -180 ||
      dLng > 180
    ) {
      throw new Error('Valid origin and destination coordinates are required for route calculation');
    }

    const apiKey = env.googleMaps.apiKey || this.apiKey;
    if (!apiKey) {
      return this.estimateRouteFallback(oLat, oLng, dLat, dLng);
    }

    if (this.routesBlockedUntil && Date.now() < this.routesBlockedUntil) {
      return this.estimateRouteFallback(oLat, oLng, dLat, dLng);
    }

    const cacheKey = `route:${oLat.toFixed(4)},${oLng.toFixed(4)}->${dLat.toFixed(4)},${dLng.toFixed(4)}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
      return cached.result;
    }

    try {
      const response = await this.executeWithRetry(
        () =>
          axios.post(
            this.routesUrl,
            {
              origin: { location: { latLng: { latitude: oLat, longitude: oLng } } },
              destination: { location: { latLng: { latitude: dLat, longitude: dLng } } },
              travelMode: 'DRIVE',
              routingPreference: 'TRAFFIC_AWARE'
            },
            {
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
              },
              timeout: this.timeoutMs
            }
          ),
        { operation: 'Google Routes API' }
      );

      const route = response.data?.routes?.[0];
      if (!route) {
        return this.estimateRouteFallback(oLat, oLng, dLat, dLng);
      }

      // Duration is returned as string with 's' suffix, e.g. "840s"
      const rawSecs = parseInt(String(route.duration || '0').replace('s', ''), 10) || 60;
      const distanceMeters = parseInt(route.distanceMeters || '0', 10) || 0;
      const minutes = Math.round(rawSecs / 60);

      const result = {
        distanceMeters,
        distanceKm: Number((distanceMeters / 1000).toFixed(2)),
        durationSeconds: rawSecs,
        formattedDuration: `${minutes} mins`,
        isEstimated: false,
        routePolyline: route.polyline?.encodedPolyline || null
      };

      this.cache.set(cacheKey, { timestamp: Date.now(), result });
      return result;
    } catch (err) {
      const sanitizedMsg = this.sanitizeError(err);
      if (
        err.response?.status === 403 ||
        err.response?.status === 429 ||
        err.response?.status === 400 ||
        String(sanitizedMsg).includes('blocked') ||
        String(sanitizedMsg).includes('permission') ||
        String(sanitizedMsg).includes('Billing') ||
        String(sanitizedMsg).includes('RESOURCE_EXHAUSTED')
      ) {
        this.routesBlockedUntil = Date.now() + 5 * 60 * 1000;
      }
      logger.warn(`[GoogleMapsService] Routes API failed: ${sanitizedMsg}. Using Haversine route estimation fallback.`);
      return this.estimateRouteFallback(oLat, oLng, dLat, dLng);
    }
  }

  /**
   * Geocode an address string using Google Geocoding API if coordinates are missing
   */
  async geocodeAddress(address) {
    if (!address || typeof address !== 'string' || !address.trim()) {
      return null;
    }

    const apiKey = env.googleMaps.apiKey || this.apiKey;
    if (!apiKey) {
      return null;
    }

    try {
      const response = await this.executeWithRetry(
        () =>
          axios.get(this.geocodeUrl, {
            params: {
              address: address.trim(),
              region: this.region,
              key: apiKey
            },
            timeout: this.timeoutMs
          }),
        { operation: 'Google Geocoding API' }
      );

      const result = response.data?.results?.[0];
      if (!result) return null;

      const loc = result.geometry?.location;
      if (loc && hasValidCoordinates(loc.lat, loc.lng)) {
        return {
          latitude: Number(loc.lat.toFixed(7)),
          longitude: Number(loc.lng.toFixed(7)),
          formattedAddress: result.formatted_address || address,
          google_place_id: result.place_id || null
        };
      }
      return null;
    } catch (err) {
      logger.warn(`[GoogleMapsService] Geocoding failed for "${address}": ${this.sanitizeError(err)}`);
      return null;
    }
  }
}

export const googleMapsService = new GoogleMapsService();
export default googleMapsService;
