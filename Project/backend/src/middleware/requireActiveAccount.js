import { formatError } from '../utils/responseFormatter.js';
import { USER_STATUS } from '../modules/users/user.model.js';

/**
 * Ensures the authenticated user account is in ACTIVE status before accessing operational features.
 */
export function requireActiveAccount(req, res, next) {
  if (!req.user) {
    return res.status(401).json(formatError('Authentication required', 'UNAUTHENTICATED'));
  }

  if (req.user.status === USER_STATUS.PENDING) {
    return res.status(403).json(
      formatError('Account is pending administrator approval before operational access is permitted.', 'ACCOUNT_PENDING_APPROVAL')
    );
  }

  if (req.user.status !== USER_STATUS.ACTIVE) {
    return res.status(403).json(
      formatError(`Account status is '${req.user.status}'. Operational access denied.`, 'ACCOUNT_NOT_ACTIVE')
    );
  }

  next();
}

export default requireActiveAccount;
