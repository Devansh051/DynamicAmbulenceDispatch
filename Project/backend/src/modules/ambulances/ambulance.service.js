import { Op } from 'sequelize';
import Ambulance, {
  AMBULANCE_STATUS,
  normalizeAmbulanceStatus,
  toDatabaseAmbulanceStatus,
  isAmbulanceAvailable
} from './ambulance.model.js';
import AmbulanceTimeline from './ambulanceTimeline.model.js';
import Hospital from '../hospitals/hospital.model.js';
import AuthAuditLog from '../audit/audit.model.js';
import sequelize from '../../config/database.js';

class AmbulanceService {
  async getAmbulances(options = {}) {
    return this.listAmbulances(options);
  }

  async listAmbulances({
    page = 1,
    limit = 20,
    search = '',
    status,
    vehicle_type,
    is_active,
    hospital_id,
    sortBy = 'AmbulanceID',
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
        { fleet_code: { [Op.like]: q } },
        { registration_number: { [Op.like]: q } }
      ];
      if (!isNaN(searchNum)) {
        orClauses.push({ AmbulanceID: searchNum });
        orClauses.push({ legacy_id: searchNum });
      }
      where[Op.or] = orClauses;
    }

    if (status) {
      // Support matching case-insensitively across legacy stored casing ('available', 'Available', 'AVAILABLE')
      const trimmed = status.trim();
      const lower = trimmed.toLowerCase();
      const upper = trimmed.toUpperCase();
      const capitalized = lower.charAt(0).toUpperCase() + lower.slice(1);
      where.Status = { [Op.in]: [lower, upper, capitalized, trimmed] };
    }

    if (vehicle_type) {
      where.vehicle_type = vehicle_type;
    }

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === 1;
    }

    if (hospital_id) {
      where.CurrentHospitalID = parseInt(hospital_id, 10);
    }

    // Whitelist sort fields
    const allowedSortFields = ['AmbulanceID', 'fleet_code', 'vehicle_type', 'Status', 'Fuel', 'CurrentHospitalID', 'is_active', 'created_at', 'updated_at'];
    const orderColumn = allowedSortFields.includes(sortBy) ? sortBy : 'AmbulanceID';
    const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { count, rows } = await Ambulance.findAndCountAll({
      where,
      include: [
        {
          model: Hospital,
          as: 'currentHospital',
          attributes: ['HospitalID', 'HospitalName', 'Location', 'city', 'state']
        }
      ],
      order: [[orderColumn, orderDir]],
      limit: limitNum,
      offset
    });

    return {
      ambulances: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    };
  }

  async getAmbulanceById(id) {
    const ambulance = await Ambulance.findByPk(id, {
      include: [
        {
          model: Hospital,
          as: 'currentHospital',
          attributes: ['HospitalID', 'HospitalName', 'Location', 'city', 'state']
        },
        {
          model: AmbulanceTimeline,
          as: 'timelineEvents',
          limit: 15,
          order: [['EventTime', 'DESC']]
        }
      ]
    });

    if (!ambulance) {
      const err = new Error(`Ambulance with ID '${id}' not found`);
      err.status = 404;
      err.code = 'AMBULANCE_NOT_FOUND';
      throw err;
    }

    return ambulance;
  }

  async createAmbulance(data, user) {
    const {
      current_hospital_id,
      fleet_code,
      vehicle_type,
      registration_number,
      fuel_level = 100,
      current_location_lat,
      current_location_lng,
      status = 'available'
    } = data;

    // Verify hospital exists
    const hospital = await Hospital.findByPk(current_hospital_id);
    if (!hospital) {
      const err = new Error(`Hospital with ID '${current_hospital_id}' does not exist.`);
      err.status = 400;
      err.code = 'INVALID_HOSPITAL_REFERENCE';
      throw err;
    }

    // Check unique fleet_code if provided
    if (fleet_code) {
      const existingFleet = await Ambulance.findOne({ where: { fleet_code } });
      if (existingFleet) {
        const err = new Error(`Fleet code '${fleet_code}' is already assigned to another ambulance.`);
        err.status = 409;
        err.code = 'DUPLICATE_FLEET_CODE';
        throw err;
      }
    }

    // Check unique registration_number if provided
    if (registration_number) {
      const existingReg = await Ambulance.findOne({ where: { registration_number } });
      if (existingReg) {
        const err = new Error(`Registration number '${registration_number}' is already registered.`);
        err.status = 409;
        err.code = 'DUPLICATE_REGISTRATION_NUMBER';
        throw err;
      }
    }

    const transaction = await sequelize.transaction();
    try {
      const newAmbulance = await Ambulance.create({
        CurrentHospitalID: current_hospital_id,
        fleet_code: fleet_code || null,
        vehicle_type: vehicle_type || undefined,
        registration_number: registration_number || null,
        Fuel: fuel_level,
        Status: status.toLowerCase(),
        current_location_lat: current_location_lat || null,
        current_location_lng: current_location_lng || null,
        is_active: true
      }, { transaction });

      // Log timeline creation
      await AmbulanceTimeline.create({
        AmbulanceID: newAmbulance.AmbulanceID,
        EventType: 'Commissioned',
        Message: `Ambulance commissioned into active fleet by ${user.name} (${user.role}) at hospital ${hospital.HospitalName}`
      }, { transaction });

      // Log auth audit
      await AuthAuditLog.create({
        user_id: user.id,
        event_type: 'AMBULANCE_CREATED',
        details: `Created ambulance #${newAmbulance.AmbulanceID} (${newAmbulance.fleet_code})`
      }, { transaction });

      await transaction.commit();
      return this.getAmbulanceById(newAmbulance.AmbulanceID);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  async updateAmbulance(id, data, user) {
    const ambulance = await this.getAmbulanceById(id);

    const {
      fleet_code,
      vehicle_type,
      registration_number,
      fuel_level,
      current_hospital_id,
      current_location_lat,
      current_location_lng,
      is_active
    } = data;

    if (current_hospital_id !== undefined) {
      const hospital = await Hospital.findByPk(current_hospital_id);
      if (!hospital) {
        const err = new Error(`Hospital with ID '${current_hospital_id}' does not exist.`);
        err.status = 400;
        err.code = 'INVALID_HOSPITAL_REFERENCE';
        throw err;
      }
      ambulance.CurrentHospitalID = current_hospital_id;
    }

    if (fleet_code && fleet_code !== ambulance.fleet_code) {
      const existingFleet = await Ambulance.findOne({
        where: { fleet_code, AmbulanceID: { [Op.ne]: ambulance.AmbulanceID } }
      });
      if (existingFleet) {
        const err = new Error(`Fleet code '${fleet_code}' is already assigned.`);
        err.status = 409;
        err.code = 'DUPLICATE_FLEET_CODE';
        throw err;
      }
      ambulance.fleet_code = fleet_code;
    }

    if (registration_number && registration_number !== ambulance.registration_number) {
      const existingReg = await Ambulance.findOne({
        where: { registration_number, AmbulanceID: { [Op.ne]: ambulance.AmbulanceID } }
      });
      if (existingReg) {
        const err = new Error(`Registration number '${registration_number}' is already registered.`);
        err.status = 409;
        err.code = 'DUPLICATE_REGISTRATION_NUMBER';
        throw err;
      }
      ambulance.registration_number = registration_number;
    }

    if (vehicle_type !== undefined) ambulance.vehicle_type = vehicle_type;
    if (fuel_level !== undefined) ambulance.Fuel = fuel_level;
    if (current_location_lat !== undefined) ambulance.current_location_lat = current_location_lat;
    if (current_location_lng !== undefined) ambulance.current_location_lng = current_location_lng;
    if (is_active !== undefined) ambulance.is_active = is_active;

    await ambulance.save();

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'AMBULANCE_UPDATED',
      details: `Updated ambulance #${ambulance.AmbulanceID} properties by ${user.name}`
    });

    return this.getAmbulanceById(ambulance.AmbulanceID);
  }

  async updateAmbulanceStatus(id, { status, fuel_level, current_hospital_id, message }, user) {
    const ambulance = await this.getAmbulanceById(id);

    const prevStatus = ambulance.Status;
    const newStatus = toDatabaseAmbulanceStatus(status);
    const normalizedStatus = normalizeAmbulanceStatus(status);

    if (fuel_level !== undefined) {
      ambulance.Fuel = fuel_level;
    }

    if (current_hospital_id !== undefined) {
      const hospital = await Hospital.findByPk(current_hospital_id);
      if (!hospital) {
        const err = new Error(`Hospital with ID '${current_hospital_id}' does not exist.`);
        err.status = 400;
        err.code = 'INVALID_HOSPITAL_REFERENCE';
        throw err;
      }
      ambulance.CurrentHospitalID = current_hospital_id;
    }

    ambulance.Status = newStatus;

    const transaction = await sequelize.transaction();
    try {
      await ambulance.save({ transaction });

      // Add timeline event matching C++ dispatch audit structure
      const timelineMessage = message || `Ambulance ${ambulance.AmbulanceID} status transitioned from '${prevStatus}' to '${newStatus}' by ${user.name} (${user.role})`;
      await AmbulanceTimeline.create({
        AmbulanceID: ambulance.AmbulanceID,
        EventType: 'StatusTransition',
        Message: timelineMessage
      }, { transaction });

      await AuthAuditLog.create({
        user_id: user.id,
        event_type: 'AMBULANCE_STATUS_CHANGED',
        details: `Ambulance #${ambulance.AmbulanceID} status changed from ${prevStatus} to ${newStatus}`
      }, { transaction });

      await transaction.commit();
      return this.getAmbulanceById(ambulance.AmbulanceID);
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
}

export const ambulanceService = new AmbulanceService();
export default ambulanceService;
