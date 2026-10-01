import ambulanceService from './ambulance.service.js';
import { formatSuccess } from '../../utils/responseFormatter.js';

export const listAmbulances = async (req, res, next) => {
  try {
    const result = await ambulanceService.listAmbulances(req.query);
    res.json(formatSuccess(result.ambulances, result.pagination));
  } catch (err) {
    next(err);
  }
};

export const getAmbulanceById = async (req, res, next) => {
  try {
    const ambulance = await ambulanceService.getAmbulanceById(req.params.id);
    res.json(formatSuccess(ambulance));
  } catch (err) {
    next(err);
  }
};

export const createAmbulance = async (req, res, next) => {
  try {
    const ambulance = await ambulanceService.createAmbulance(req.body, req.user);
    res.status(201).json(formatSuccess(ambulance, { message: 'Ambulance commissioned successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateAmbulance = async (req, res, next) => {
  try {
    const ambulance = await ambulanceService.updateAmbulance(req.params.id, req.body, req.user);
    res.json(formatSuccess(ambulance, { message: 'Ambulance details updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export const updateAmbulanceStatus = async (req, res, next) => {
  try {
    const ambulance = await ambulanceService.updateAmbulanceStatus(req.params.id, req.body, req.user);
    res.json(formatSuccess(ambulance, { message: 'Ambulance status updated successfully' }));
  } catch (err) {
    next(err);
  }
};

export default {
  listAmbulances,
  getAmbulanceById,
  createAmbulance,
  updateAmbulance,
  updateAmbulanceStatus
};
