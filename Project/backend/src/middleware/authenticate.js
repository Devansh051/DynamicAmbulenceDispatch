import sessionService from '../modules/auth/session.service.js';
import User from '../modules/users/user.model.js';
import { formatError } from '../utils/responseFormatter.js';

/**
 * Authentication Middleware
 * Validates session JWT from Authorization Bearer header or HttpOnly cookie.
 * Attaches req.user and req.token.
 */
export async function authenticate(req, res, next) {
  try {
    const token = sessionService.extractToken(req);
    if (!token) {
      return res.status(401).json(formatError('Authentication required. No session token provided.', 'UNAUTHENTICATED'));
    }

    const verification = await sessionService.verifyActiveSessionToken(token);
    if (!verification.valid) {
      const code = verification.expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
      return res.status(401).json(formatError(verification.error || 'Invalid session token', code));
    }

    const { sub } = verification.payload;
    const user = await User.findByPk(sub);
    if (!user) {
      return res.status(401).json(formatError('User account associated with this session no longer exists', 'USER_NOT_FOUND'));
    }

    if (user.status === 'INACTIVE' || user.status === 'SUSPENDED') {
      return res.status(403).json(formatError(`Account is ${user.status.toLowerCase()}. Access denied.`, 'ACCOUNT_INACTIVE'));
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    next(error);
  }
}

export default authenticate;
