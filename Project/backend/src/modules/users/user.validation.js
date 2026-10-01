import { USER_ROLES, USER_STATUS } from './user.model.js';

export function validateProvisionUser(req) {
  const { email, name, role } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'A valid email address is required';
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return 'User display name is required';
  }
  if (role && !Object.values(USER_ROLES).includes(role)) {
    return `Invalid role. Allowed roles: ${Object.values(USER_ROLES).join(', ')}`;
  }
  return null;
}

export function validateUpdateStatus(req) {
  const { status } = req.body || {};
  if (!status || !Object.values(USER_STATUS).includes(status)) {
    return `Invalid status. Allowed values: ${Object.values(USER_STATUS).join(', ')}`;
  }
  return null;
}

export function validateUpdateRole(req) {
  const { role } = req.body || {};
  if (!role || !Object.values(USER_ROLES).includes(role)) {
    return `Invalid role. Allowed values: ${Object.values(USER_ROLES).join(', ')}`;
  }
  return null;
}

export default {
  validateProvisionUser,
  validateUpdateStatus,
  validateUpdateRole
};
