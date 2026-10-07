import env from '../config/env.js';
import Emergency from '../modules/emergencies/emergency.model.js';
import { formatError } from '../utils/responseFormatter.js';

export default async function authorizeIncidentAccess(req, res, next) {
  if (req.user?.role !== 'AMBULANCE_CREW') return next();
  try {
    const boundId = Number(env.fleet.crewBindings[String(req.user.id)]);
    const incident = boundId ? await Emergency.findByPk(req.params.id) : null;
    if (!incident || Number(incident.assigned_ambulance_id) !== boundId) {
      return res.status(403).json(formatError('Crew access requires an assigned vehicle binding.', 'INCIDENT_ACCESS_DENIED'));
    }
    return next();
  } catch (error) { return next(error); }
}
