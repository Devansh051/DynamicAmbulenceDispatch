import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { User, UserAuthIdentity } from '../index.js';
import { USER_ROLES, USER_STATUS } from './user.model.js';
import { recordAuditEvent, AUDIT_EVENTS } from '../audit/audit.service.js';
import { AuthError, validatePasswordStrength } from '../auth/auth.service.js';
import env from '../../config/env.js';

/**
 * Lists users with optional search, role filter, status filter, and pagination
 */
export async function listUsers({ page = 1, limit = 20, search = '', role = '', status = '' }) {
  const offset = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
  const take = Math.min(100, Math.max(1, parseInt(limit, 10)));

  const where = {};

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: term } },
      { email: { [Op.like]: term } }
    ];
  }

  if (role && Object.values(USER_ROLES).includes(role)) {
    where.role = role;
  }

  if (status && Object.values(USER_STATUS).includes(status)) {
    where.status = status;
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    offset,
    limit: take,
    include: [{ model: UserAuthIdentity, as: 'identities' }]
  });

  const users = rows.map(u => u.toSafeObject(u.identities || []));

  return {
    users,
    pagination: {
      total: count,
      page: parseInt(page, 10),
      limit: take,
      totalPages: Math.ceil(count / take)
    }
  };
}

/**
 * Retrieve user by ID
 */
export async function getUserById(id) {
  const user = await User.findByPk(id, {
    include: [{ model: UserAuthIdentity, as: 'identities' }]
  });
  if (!user) {
    throw new AuthError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user.toSafeObject(user.identities || []);
}

/**
 * Administrator provisions a new user with an initial role and temporary password
 */
export async function provisionUser({ email, name, role = USER_ROLES.DISPATCHER, temporaryPassword = null, adminId, req = null }) {
  if (!email || !name) {
    throw new AuthError('Email and display name are required', 400, 'INVALID_INPUT');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await User.findOne({ where: { email: normalizedEmail } });
  if (existing) {
    throw new AuthError('A user account with this email address already exists', 409, 'USER_ALREADY_EXISTS');
  }

  if (!Object.values(USER_ROLES).includes(role)) {
    throw new AuthError(`Invalid role. Allowed roles: ${Object.values(USER_ROLES).join(', ')}`, 400, 'INVALID_ROLE');
  }

  // Generate temporary password if not provided
  let tempPass = temporaryPassword;
  if (!tempPass) {
    tempPass = 'Ems' + crypto.randomBytes(4).toString('hex') + '!9';
  } else {
    const error = validatePasswordStrength(tempPass);
    if (error) {
      throw new AuthError(error, 400, 'WEAK_PASSWORD');
    }
  }

  const passwordHash = await bcrypt.hash(tempPass, env.auth.bcryptRounds || 10);

  const newUser = await User.create({
    email: normalizedEmail,
    name: name.trim(),
    password_hash: passwordHash,
    role,
    status: USER_STATUS.ACTIVE,
    email_verified: true,
    must_change_password: true,
    approved_at: new Date(),
    approved_by: adminId,
    created_at: new Date(),
    updated_at: new Date()
  });

  await recordAuditEvent({
    userId: newUser.id,
    eventType: AUDIT_EVENTS.USER_PROVISIONED,
    details: { provisionedBy: adminId, role, email: normalizedEmail },
    req
  });

  return {
    user: newUser.toSafeObject([]),
    temporaryPassword: tempPass
  };
}

/**
 * Checks whether an action would leave the system without any active administrators
 */
async function ensureNotLastActiveAdmin(userId) {
  const activeAdmins = await User.count({
    where: {
      role: USER_ROLES.ADMIN,
      status: USER_STATUS.ACTIVE
    }
  });

  const targetUser = await User.findByPk(userId);
  if (targetUser && targetUser.role === USER_ROLES.ADMIN && targetUser.status === USER_STATUS.ACTIVE && activeAdmins <= 1) {
    throw new AuthError('Operation rejected: Cannot remove, demote, or deactivate the last active administrator.', 400, 'LAST_ADMIN_PROTECTION');
  }
}

/**
 * Updates user basic details (name, etc.)
 */
export async function updateUser(id, { name, role, status }, adminId, req = null) {
  const user = await User.findByPk(id, {
    include: [{ model: UserAuthIdentity, as: 'identities' }]
  });
  if (!user) {
    throw new AuthError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (name && typeof name === 'string' && name.trim()) {
    user.name = name.trim();
  }

  if (role && role !== user.role) {
    if (!Object.values(USER_ROLES).includes(role)) {
      throw new AuthError('Invalid role specified', 400, 'INVALID_ROLE');
    }
    if (user.role === USER_ROLES.ADMIN && role !== USER_ROLES.ADMIN) {
      await ensureNotLastActiveAdmin(user.id);
    }
    user.role = role;
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.USER_ROLE_CHANGED,
      details: { newRole: role, updatedBy: adminId },
      req
    });
  }

  if (status && status !== user.status) {
    if (!Object.values(USER_STATUS).includes(status)) {
      throw new AuthError('Invalid status specified', 400, 'INVALID_STATUS');
    }
    if (user.role === USER_ROLES.ADMIN && status !== USER_STATUS.ACTIVE) {
      await ensureNotLastActiveAdmin(user.id);
    }
    user.status = status;
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.USER_STATUS_CHANGED,
      details: { newStatus: status, updatedBy: adminId },
      req
    });
  }

  user.updated_at = new Date();
  await user.save();

  await recordAuditEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.USER_UPDATED,
    details: { updatedBy: adminId },
    req
  });

  return user.toSafeObject(user.identities || []);
}

/**
 * Changes user account status
 */
export async function updateUserStatus(id, newStatus, adminId, req = null) {
  return await updateUser(id, { status: newStatus }, adminId, req);
}

/**
 * Changes user application role
 */
export async function updateUserRole(id, newRole, adminId, req = null) {
  return await updateUser(id, { role: newRole }, adminId, req);
}

/**
 * Approves a pending user account
 */
export async function approveUser(id, adminId, req = null) {
  const user = await User.findByPk(id, {
    include: [{ model: UserAuthIdentity, as: 'identities' }]
  });
  if (!user) {
    throw new AuthError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (user.status !== USER_STATUS.PENDING) {
    throw new AuthError(`Cannot approve user with status '${user.status}' (only PENDING accounts can be approved)`, 400, 'INVALID_STATUS_TRANSITION');
  }

  user.status = USER_STATUS.ACTIVE;
  user.approved_at = new Date();
  user.approved_by = adminId;
  user.updated_at = new Date();
  await user.save();

  await recordAuditEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.USER_APPROVED,
    details: { approvedBy: adminId },
    req
  });

  return user.toSafeObject(user.identities || []);
}

/**
 * Rejects a pending user account
 */
export async function rejectUser(id, adminId, req = null) {
  const user = await User.findByPk(id, {
    include: [{ model: UserAuthIdentity, as: 'identities' }]
  });
  if (!user) {
    throw new AuthError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (user.status !== USER_STATUS.PENDING) {
    throw new AuthError(`Cannot reject user with status '${user.status}' (only PENDING accounts can be rejected)`, 400, 'INVALID_STATUS_TRANSITION');
  }

  user.status = USER_STATUS.REJECTED;
  user.updated_at = new Date();
  await user.save();

  await recordAuditEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.USER_REJECTED,
    details: { rejectedBy: adminId },
    req
  });

  return user.toSafeObject(user.identities || []);
}

export default {
  listUsers,
  getUserById,
  provisionUser,
  updateUser,
  updateUserStatus,
  updateUserRole,
  approveUser,
  rejectUser
};
