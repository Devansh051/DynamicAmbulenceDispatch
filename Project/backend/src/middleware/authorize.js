import { formatError } from '../utils/responseFormatter.js';

/**
 * Role-Based Access Control (RBAC) Middleware.
 * Usage: router.get('/admin-only', authenticate, authorize('ADMIN'), handler);
 *
 * @param  {...string} allowedRoles
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json(
        formatError(
          `Access forbidden: role '${req.user.role}' is not authorized to access this resource. Required roles: ${allowedRoles.join(', ')}`,
          'FORBIDDEN'
        )
      );
    }

    next();
  };
}

export default authorize;
