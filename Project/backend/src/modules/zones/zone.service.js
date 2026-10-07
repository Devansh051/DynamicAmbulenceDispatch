import { Op } from 'sequelize';
import ServiceZone from './zone.model.js';
import AuthAuditLog from '../audit/audit.model.js';

class ZoneService {
  async listZones({
    page = 1,
    limit = 20,
    search = '',
    is_active,
    sortBy = 'zone_code',
    sortOrder = 'ASC'
  } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const where = {};

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { zone_code: { [Op.like]: q } },
        { name: { [Op.like]: q } },
        { description: { [Op.like]: q } }
      ];
    }

    if (is_active !== undefined && is_active !== '') {
      where.is_active = is_active === 'true' || is_active === true || is_active === 1;
    }

    const allowedSortFields = ['id', 'zone_code', 'name', 'radius_km', 'is_active', 'created_at'];
    const orderColumn = allowedSortFields.includes(sortBy) ? sortBy : 'zone_code';
    const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const { count, rows } = await ServiceZone.findAndCountAll({
      where,
      order: [[orderColumn, orderDir]],
      limit: limitNum,
      offset
    });

    return {
      zones: rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum)
      }
    };
  }

  async getZoneById(id) {
    const zone = await ServiceZone.findByPk(id);
    if (!zone) {
      const err = new Error(`Service zone with ID '${id}' not found`);
      err.status = 404;
      err.code = 'ZONE_NOT_FOUND';
      throw err;
    }
    return zone;
  }

  async createZone(data, user) {
    const {
      zone_code,
      name,
      description,
      center_latitude,
      center_longitude,
      radius_km,
      is_active = true
    } = data;

    const normalizedCode = zone_code.trim().toUpperCase();

    const existing = await ServiceZone.findOne({ where: { zone_code: normalizedCode } });
    if (existing) {
      const err = new Error(`Service zone code '${normalizedCode}' already exists.`);
      err.status = 409;
      err.code = 'DUPLICATE_ZONE_CODE';
      throw err;
    }

    const zone = await ServiceZone.create({
      zone_code: normalizedCode,
      name: name.trim(),
      description: description ? description.trim() : null,
      center_latitude: center_latitude ?? null,
      center_longitude: center_longitude ?? null,
      radius_km: radius_km || null,
      is_active: Boolean(is_active)
    });

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'ZONE_CREATED',
      details: `Created service zone ${zone.zone_code} (${zone.name}) by ${user.name}`
    });

    return zone;
  }

  async updateZone(id, data, user) {
    const zone = await this.getZoneById(id);

    const {
      zone_code,
      name,
      description,
      center_latitude,
      center_longitude,
      radius_km,
      is_active
    } = data;

    if (zone_code && zone_code.trim().toUpperCase() !== zone.zone_code) {
      const normalizedCode = zone_code.trim().toUpperCase();
      const existing = await ServiceZone.findOne({
        where: { zone_code: normalizedCode, id: { [Op.ne]: zone.id } }
      });
      if (existing) {
        const err = new Error(`Service zone code '${normalizedCode}' already exists.`);
        err.status = 409;
        err.code = 'DUPLICATE_ZONE_CODE';
        throw err;
      }
      zone.zone_code = normalizedCode;
    }

    if (name !== undefined) zone.name = name.trim();
    if (description !== undefined) zone.description = description ? description.trim() : null;
    if (center_latitude !== undefined) zone.center_latitude = center_latitude;
    if (center_longitude !== undefined) zone.center_longitude = center_longitude;
    if (radius_km !== undefined) zone.radius_km = radius_km;
    if (is_active !== undefined) zone.is_active = is_active;

    await zone.save();

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'ZONE_UPDATED',
      details: `Updated service zone ${zone.zone_code} by ${user.name}`
    });

    return zone;
  }

  async updateZoneStatus(id, isActive, user) {
    const zone = await this.getZoneById(id);

    zone.is_active = Boolean(isActive);
    await zone.save();

    await AuthAuditLog.create({
      user_id: user.id,
      event_type: 'ZONE_STATUS_CHANGED',
      details: `Service zone ${zone.zone_code} active status changed to ${zone.is_active} by ${user.name}`
    });

    return zone;
  }
}

export const zoneService = new ZoneService();
export default zoneService;
