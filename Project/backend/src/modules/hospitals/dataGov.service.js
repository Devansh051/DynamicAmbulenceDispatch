import axios from 'axios';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';
import { FACILITY_TYPES, OWNERSHIP_TYPES } from './hospital.model.js';

class DataGovService {
  constructor() {
    this.baseUrl = env.dataGov.baseUrl || 'https://api.data.gov.in/resource/';
    this.resourceId = env.dataGov.resourceId;
    this.apiKey = env.dataGov.apiKey;
    this.timeoutMs = 12000;
    this.maxRetries = 3;
  }

  /**
   * Safe sanitization of error messages to prevent exposing API keys in logs or errors
   */
  sanitizeError(error) {
    if (!error) return 'Unknown error';
    let msg = error.message || String(error);
    if (this.apiKey && this.apiKey.length > 4) {
      msg = msg.split(this.apiKey).join('[REDACTED_API_KEY]');
    }
    // Also redact any explicit query param api-key=...
    msg = msg.replace(/api-key=[^&\s]+/gi, 'api-key=REDACTED');
    return msg;
  }

  sanitizeErrorMessage(error) {
    return this.sanitizeError(error);
  }

  /**
   * Fetch a single page of health facilities from data.gov.in API with retries
   */
  async fetchHealthFacilities({ offset = 0, limit = 50, filters = {} } = {}) {
    const apiKey = env.dataGov.apiKey || this.apiKey;
    const resourceId = env.dataGov.resourceId || this.resourceId;
    const baseUrl = env.dataGov.baseUrl || this.baseUrl;

    if (!apiKey) {
      logger.warn('[DataGovService] No DATA_GOV_API_KEY configured. Returning empty records.');
      return { total: 0, count: 0, offset, limit, records: [] };
    }

    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const requestUrl = `${cleanBase}${resourceId}`;

    const params = {
      'api-key': apiKey,
      format: 'json',
      offset,
      limit
    };

    // Attach any dataset filters (e.g. filters[state_name]=Karnataka)
    Object.keys(filters).forEach(k => {
      params[`filters[${k}]`] = filters[k];
    });

    let attempt = 0;
    let lastError = null;

    while (attempt < this.maxRetries) {
      attempt++;
      try {
        logger.info(`[DataGovService] Fetching facilities from data.gov.in (offset: ${offset}, limit: ${limit}, attempt: ${attempt})...`);
        const response = await axios.get(requestUrl, {
          params,
          timeout: this.timeoutMs,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'DynamicAmbulanceDispatch-EMS/1.0'
          }
        });

        const data = response.data;
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid JSON response received from data.gov.in');
        }

        // data.gov.in standard response format: { status, total, count, limit, offset, records: [...] }
        const rawRecords = Array.isArray(data.records) ? data.records : (Array.isArray(data.data) ? data.data : []);
        const total = parseInt(data.total, 10) || rawRecords.length;
        const count = parseInt(data.count, 10) || rawRecords.length;

        const normalizedRecords = rawRecords
          .map(r => this.normalizeRecord(r))
          .filter(r => r !== null);

        logger.info(`[DataGovService] Successfully fetched ${normalizedRecords.length} valid records (Total in dataset: ${total}).`);

        return {
          total,
          count,
          offset,
          limit,
          records: normalizedRecords
        };
      } catch (err) {
        lastError = err;
        const status = err.response?.status;
        const safeMsg = this.sanitizeError(err);

        // Check for client errors like 401 Unauthorized or 429 Too Many Requests
        if (status === 401 || status === 403) {
          logger.error(`[DataGovService] Authentication failed against data.gov.in (HTTP ${status}). Check DATA_GOV_API_KEY.`);
          throw new Error(`data.gov.in authentication error: HTTP ${status}`);
        }

        if (status === 429) {
          logger.warn(`[DataGovService] Rate limit exceeded on data.gov.in (HTTP 429). Backing off before retry...`);
          await new Promise(r => setTimeout(r, 2000 * attempt));
          continue;
        }

        // For network timeouts or 5xx server errors, retry with exponential backoff
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          logger.warn(`[DataGovService] Transient error on attempt ${attempt}: ${safeMsg}. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          logger.error(`[DataGovService] All ${this.maxRetries} attempts failed for data.gov.in fetch: ${safeMsg}`);
        }
      }
    }

    throw new Error(`Failed to fetch health facilities from data.gov.in after ${this.maxRetries} attempts: ${this.sanitizeError(lastError)}`);
  }

  /**
   * Fetch all pages of health facilities subject to a maximum batch limit
   */
  async fetchAllHealthFacilities({ maxPages = 20, batchLimit = 50, filters = {}, onProgress } = {}) {
    let offset = 0;
    let page = 0;
    let allRecords = [];
    let totalRecords = 0;

    while (page < maxPages) {
      page++;
      const result = await this.fetchHealthFacilities({ offset, limit: batchLimit, filters });
      totalRecords = result.total;

      if (!result.records || result.records.length === 0) {
        break;
      }

      allRecords.push(...result.records);

      if (onProgress && typeof onProgress === 'function') {
        onProgress({
          page,
          fetchedCount: allRecords.length,
          total: totalRecords
        });
      }

      offset += result.records.length;
      if (offset >= totalRecords || result.records.length < batchLimit) {
        break;
      }

      // Small delay between page requests to avoid hitting rate limits
      await new Promise(r => setTimeout(r, 250));
    }

    return {
      total: totalRecords,
      count: allRecords.length,
      records: allRecords
    };
  }

  /**
   * Normalize an incoming record from data.gov.in NIN dataset safely
   */
  normalizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // Possible property variations in government datasets
    const rawName = raw.facility_name || raw.HospitalName || raw.hospital_name || raw.name || raw.facility || raw.nin_name;
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      return null;
    }

    const facilityName = rawName.trim();
    const govId = String(raw.nin_to_hfr_id || raw.nin || raw.facility_id || raw.id || raw.nin_id || '').trim() || null;

    // Address & Localities
    const address = String(raw.facility_address || raw.address || raw.Location || raw.location || '').trim() || null;
    const district = String(raw.district_name || raw.district || '').trim() || null;
    const state = String(raw.state_name || raw.state || 'Karnataka').trim();
    const postalCode = String(raw.pincode || raw.postal_code || raw.pin_code || '').trim() || null;

    // Latitude & Longitude validation
    let lat = null;
    let lng = null;
    const rawLat = parseFloat(raw.latitude || raw.lat);
    const rawLng = parseFloat(raw.longitude || raw.long || raw.lng);

    if (!isNaN(rawLat) && !isNaN(rawLng)) {
      // Must not be 0,0 and must fall within valid geographic bounds
      if (rawLat !== 0 && rawLng !== 0 && rawLat >= -90 && rawLat <= 90 && rawLng >= -180 && rawLng <= 180) {
        lat = Number(rawLat.toFixed(7));
        lng = Number(rawLng.toFixed(7));
      }
    }

    // Facility Type Normalization
    let facilityType = FACILITY_TYPES.GENERAL_HOSPITAL;
    const rawType = String(raw.facility_type || raw.category || raw.type || '').toUpperCase();
    if (rawType.includes('TRAUMA') || rawType.includes('EMERGENCY')) {
      facilityType = FACILITY_TYPES.TRAUMA_CENTER;
    } else if (rawType.includes('TERTIARY') || rawType.includes('SUPER') || rawType.includes('SPECIALITY')) {
      facilityType = FACILITY_TYPES.TERTIARY_CARE;
    } else if (rawType.includes('CLINIC') || rawType.includes('PHC') || rawType.includes('CHC')) {
      facilityType = FACILITY_TYPES.SPECIALTY_CLINIC;
    }

    // Ownership Normalization
    let ownership = OWNERSHIP_TYPES.PUBLIC;
    const rawOwn = String(raw.ownership || raw.facility_ownership || raw.management || '').toUpperCase();
    if (rawOwn.includes('PRIVATE') || rawOwn.includes('TRUST')) {
      ownership = rawOwn.includes('TRUST') ? OWNERSHIP_TYPES.TRUST : OWNERSHIP_TYPES.PRIVATE;
    }

    // Contact
    const phone = String(raw.contact_number || raw.phone || raw.telephone || raw.mobile || '').trim() || null;

    return {
      facility_name: facilityName,
      name: facilityName,
      government_id: govId,
      address,
      district,
      state,
      postal_code: postalCode,
      latitude: lat,
      longitude: lng,
      facility_type: facilityType,
      ownership,
      phone,
      emergency_services: raw.emergency_services === true || raw.emergency_services === '1' || raw.emergency_services === 'Yes',
      raw_source: raw
    };
  }
}

export const dataGovService = new DataGovService();
export default dataGovService;
