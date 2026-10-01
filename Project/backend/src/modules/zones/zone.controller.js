import zoneService from './zone.service.js';
import { formatSuccess } from '../../utils/responseFormatter.js';

export const listZones = async (req, res, next) => {
  try {
    const result = await zoneService.listZones(req.query);
    res.json(formatSuccess(result.zones, result.pagination));
  } catch (err) {
    next(err);
  }
};

export const getZoneById = async (req, res, next) => {
  try {
    const zone = await zoneService.getZoneById(req.params.id);
    res.json(formatSuccess(zone));
  } catch (err) {
    next(err);
  }
};

export const createZone = async (req, res, next) => {
  try {
    const zone = await zoneService.createZone(req.body, req.user);
    res.status(201).json(formatSuccess(zone, { message: 'Service zone created successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateZone = async (req, res, next) => {
  try {
    const zone = await zoneService.updateZone(req.params.id, req.body, req.user);
    res.json(formatSuccess(zone, { message: 'Service zone updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateZoneStatus = async (req, res, next) => {
  try {
    const zone = await zoneService.updateZoneStatus(req.params.id, req.body.is_active, req.user);
    res.json(formatSuccess(zone, { message: 'Service zone status updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export default {
  listZones,
  getZoneById,
  createZone,
  updateZone,
  updateZoneStatus
};
