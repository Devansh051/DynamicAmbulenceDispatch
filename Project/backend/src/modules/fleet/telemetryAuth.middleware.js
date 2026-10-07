import crypto from 'crypto';
import env from '../../config/env.js';
import authenticate from '../../middleware/authenticate.js';
import { formatError } from '../../utils/responseFormatter.js';

const safelyMatches = (provided, expected) => {
  if (!provided || !expected) return false;
  const left = Buffer.from(String(provided));
  const right = Buffer.from(String(expected));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

export function authenticateTelemetry(req, res, next) {
  const sourceId = req.get('x-source-id');
  const device = sourceId && env.fleet.telemetryDevices[sourceId];
  if (device && safelyMatches(req.get('x-telemetry-key'), device.key)) {
    req.telemetryPrincipal = { kind: 'device', sourceId, ambulanceId: Number(device.ambulance_id) };
    return next();
  }
  if (env.fleet.simulatorEnabled && env.nodeEnv !== 'production' && safelyMatches(req.get('x-simulator-key'), env.fleet.simulatorTelemetryKey)) {
    req.telemetryPrincipal = { kind: 'simulator', sourceId: 'simulator' };
    return next();
  }
  return authenticate(req, res, (error) => {
    if (error) return next(error);
    req.telemetryPrincipal = { kind: 'user', user: req.user, sourceId: 'user:' + req.user.id };
    return next();
  });
}

export function authorizeTelemetryUser(req, res, next) {
  if (req.telemetryPrincipal?.kind !== 'user') return next();
  if (req.user?.status !== 'ACTIVE' || !['ADMIN', 'DISPATCHER', 'AMBULANCE_CREW'].includes(req.user?.role)) {
    return res.status(403).json(formatError('This account cannot submit telemetry.', 'FORBIDDEN'));
  }
  return next();
}

export default authenticateTelemetry;
