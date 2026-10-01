import bcrypt from 'bcrypt';
import sequelize from '../../config/database.js';
import { User, UserAuthIdentity } from '../index.js';
import { USER_ROLES, USER_STATUS } from '../users/user.model.js';
import sessionService from './session.service.js';
import googleAuthService from './google-auth.service.js';
import { recordAuditEvent, AUDIT_EVENTS } from '../audit/audit.service.js';
import env from '../../config/env.js';

/**
 * Custom application error with HTTP status code and error code
 */
export class AuthError extends Error {
  constructor(message, statusCode = 400, code = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Validates password strength (min 8 characters, at least 1 uppercase or number)
 */
export function validatePasswordStrength(password) {
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters in length';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must contain both letters and at least one number';
  }
  return null;
}

/**
 * Local email/password login
 */
export async function loginWithCredentials({ email, password, req = null }) {
  if (!email || !password) {
    throw new AuthError('Email and password are required', 400, 'INVALID_INPUT');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalizedEmail } });

  // Prevent timing attacks by always performing a compare
  if (!user || !user.password_hash) {
    await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890123456789012');
    await recordAuditEvent({
      userId: null,
      eventType: AUDIT_EVENTS.LOGIN_FAILED,
      details: { reason: 'User not found or no password hash', email: normalizedEmail },
      req
    });
    throw new AuthError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.LOGIN_FAILED,
      details: { reason: 'Incorrect password', email: normalizedEmail },
      req
    });
    throw new AuthError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Account status verification
  if (user.status === USER_STATUS.PENDING) {
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.LOGIN_FAILED,
      details: { reason: 'Account pending administrator approval' },
      req
    });
    throw new AuthError('Account is pending administrator approval before operational access is granted', 403, 'ACCOUNT_PENDING_APPROVAL');
  }

  if (user.status === USER_STATUS.INACTIVE || user.status === USER_STATUS.SUSPENDED) {
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.LOGIN_FAILED,
      details: { reason: `Account status: ${user.status}` },
      req
    });
    throw new AuthError(`Account is currently ${user.status.toLowerCase()}. Please contact an administrator`, 403, 'ACCOUNT_INACTIVE');
  }

  if (user.status === USER_STATUS.REJECTED) {
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.LOGIN_FAILED,
      details: { reason: 'Account registration rejected' },
      req
    });
    throw new AuthError('Account registration was not approved', 403, 'ACCOUNT_REJECTED');
  }

  // Generate session token
  const { token } = sessionService.createSessionToken(user);

  await recordAuditEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.LOGIN_SUCCESS,
    details: { role: user.role },
    req
  });

  const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
  return {
    user: user.toSafeObject(identities),
    token
  };
}

/**
 * Google Sign-In verification and account resolution
 */
export async function loginWithGoogle({ idToken, req = null }) {
  if (!idToken) {
    throw new AuthError('Google credential token is required', 400, 'MISSING_CREDENTIAL');
  }

  // 1. Verify Google credential
  let googleData;
  try {
    googleData = await googleAuthService.verifyGoogleIdToken(idToken);
  } catch (err) {
    throw new AuthError(`Invalid Google credential: ${err.message}`, 400, 'INVALID_GOOGLE_CREDENTIAL');
  }
  const { sub, email, email_verified, name } = googleData;

  if (!email_verified) {
    await recordAuditEvent({
      userId: null,
      eventType: AUDIT_EVENTS.GOOGLE_LOGIN_FAILED,
      details: { reason: 'Unverified Google email', email },
      req
    });
    throw new AuthError('Google account email is not verified by Google', 403, 'GOOGLE_EMAIL_UNVERIFIED');
  }

  // 2. Case A: Existing Google-linked identity (by verified subject)
  const existingIdentity = await UserAuthIdentity.findOne({
    where: {
      provider: 'google',
      provider_subject: sub
    }
  });

  if (existingIdentity) {
    const user = await User.findByPk(existingIdentity.user_id);
    if (!user) {
      throw new AuthError('Associated user account no longer exists', 404, 'USER_NOT_FOUND');
    }

    if (user.status === USER_STATUS.PENDING) {
      await recordAuditEvent({
        userId: user.id,
        eventType: AUDIT_EVENTS.GOOGLE_LOGIN_FAILED,
        details: { reason: 'Account pending approval' },
        req
      });
      throw new AuthError('Your account is pending administrator approval before operational access is granted', 403, 'ACCOUNT_PENDING_APPROVAL');
    }

    if (user.status === USER_STATUS.INACTIVE || user.status === USER_STATUS.SUSPENDED) {
      await recordAuditEvent({
        userId: user.id,
        eventType: AUDIT_EVENTS.GOOGLE_LOGIN_FAILED,
        details: { reason: `Account status: ${user.status}` },
        req
      });
      throw new AuthError(`Your account is ${user.status.toLowerCase()}. Please contact an administrator`, 403, 'ACCOUNT_INACTIVE');
    }

    if (user.status === USER_STATUS.REJECTED) {
      throw new AuthError('Account registration was not approved', 403, 'ACCOUNT_REJECTED');
    }

    const { token } = sessionService.createSessionToken(user);
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.GOOGLE_LOGIN_SUCCESS,
      details: { role: user.role, sub },
      req
    });

    const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
    return {
      user: user.toSafeObject(identities),
      token
    };
  }

  // 3. Case B: Existing local account with matching email, but not linked yet
  const userWithEmail = await User.findOne({ where: { email } });
  if (userWithEmail) {
    await recordAuditEvent({
      userId: userWithEmail.id,
      eventType: AUDIT_EVENTS.GOOGLE_LOGIN_FAILED,
      details: { reason: 'Unlinked Google login attempt for existing local email', email },
      req
    });
    throw new AuthError(
      'An EMS account with this email address already exists. To access your account, log in with your email and password, then link Google from your Profile Settings.',
      409,
      'ACCOUNT_EXISTS_LINK_REQUIRED'
    );
  }

  // 4. Case C: New Google identity (unregistered)
  const signupMode = env.auth.googleSignupMode; // 'disabled' or 'pending'

  if (signupMode === 'disabled') {
    await recordAuditEvent({
      userId: null,
      eventType: AUDIT_EVENTS.GOOGLE_LOGIN_FAILED,
      details: { reason: 'Public Google registration disabled', email, sub },
      req
    });
    throw new AuthError(
      'Public Google registration is disabled for this EMS system. Please contact an administrator to provision your account.',
      403,
      'SIGNUP_DISABLED'
    );
  }

  // Provision as a restricted PENDING account with non-privileged role
  const transaction = await sequelize.transaction();
  try {
    const newUser = await User.create({
      email,
      name: name || email.split('@')[0],
      password_hash: null,
      role: USER_ROLES.DISPATCHER, // Default operational role (not ADMIN)
      status: USER_STATUS.PENDING,  // Restricted pending administrator approval
      email_verified: true,
      must_change_password: false
    }, { transaction });

    await UserAuthIdentity.create({
      user_id: newUser.id,
      provider: 'google',
      provider_subject: sub,
      provider_email: email,
      provider_email_verified: true
    }, { transaction });

    await transaction.commit();

    await recordAuditEvent({
      userId: newUser.id,
      eventType: AUDIT_EVENTS.GOOGLE_SIGNUP_PENDING,
      details: { email, sub },
      req
    });

    throw new AuthError(
      'Your Google account has been registered and is now pending administrator approval. You will receive access once approved.',
      403,
      'ACCOUNT_PENDING_APPROVAL'
    );
  } catch (err) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw err;
  }
}

/**
 * Link Google identity to existing authenticated user account
 */
export async function linkGoogleAccount({ userId, idToken, req = null }) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError('User account not found', 404, 'USER_NOT_FOUND');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw new AuthError('Only active accounts can link external authentication providers', 403, 'ACCOUNT_NOT_ACTIVE');
  }

  let googleData;
  try {
    googleData = await googleAuthService.verifyGoogleIdToken(idToken);
  } catch (err) {
    throw new AuthError(`Invalid Google credential: ${err.message}`, 400, 'INVALID_GOOGLE_CREDENTIAL');
  }
  const { sub, email, email_verified } = googleData;

  // Check if this Google subject is already linked to ANY account
  const existingLink = await UserAuthIdentity.findOne({
    where: { provider: 'google', provider_subject: sub }
  });

  if (existingLink) {
    if (existingLink.user_id === user.id) {
      const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
      return user.toSafeObject(identities);
    }
    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.GOOGLE_LINK_FAILED,
      details: { reason: 'Google identity already linked to another account', sub },
      req
    });
    throw new AuthError('This Google account is already linked to a different EMS user profile.', 409, 'IDENTITY_ALREADY_LINKED');
  }

  // Create link in transaction
  const transaction = await sequelize.transaction();
  try {
    await UserAuthIdentity.create({
      user_id: user.id,
      provider: 'google',
      provider_subject: sub,
      provider_email: email,
      provider_email_verified: email_verified
    }, { transaction });

    await transaction.commit();

    await recordAuditEvent({
      userId: user.id,
      eventType: AUDIT_EVENTS.GOOGLE_LINK_SUCCESS,
      details: { provider: 'google', sub, email },
      req
    });

    const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
    return user.toSafeObject(identities);
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * Unlink Google identity from existing authenticated user account
 */
export async function unlinkGoogleAccount({ userId, req = null }) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError('User account not found', 404, 'USER_NOT_FOUND');
  }

  const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
  const googleIdentity = identities.find(id => id.provider === 'google');

  if (!googleIdentity) {
    throw new AuthError('No linked Google account found for this user', 404, 'IDENTITY_NOT_FOUND');
  }

  // Crucial check: Prevent unlinking if it's the only login method!
  const otherIdentitiesCount = identities.length - 1;
  const hasLocalPassword = Boolean(user.password_hash);

  if (!hasLocalPassword && otherIdentitiesCount === 0) {
    throw new AuthError(
      'Cannot unlink Google account. This is currently your only authentication method. Please set a local password in Security Settings first.',
      400,
      'CANNOT_UNLINK_ONLY_AUTH_METHOD'
    );
  }

  await googleIdentity.destroy();

  await recordAuditEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.GOOGLE_UNLINK_SUCCESS,
    details: { provider: 'google' },
    req
  });

  const remainingIdentities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
  return user.toSafeObject(remainingIdentities);
}

/**
 * Change local password
 */
export async function changePassword({ userId, currentPassword, newPassword, req = null }) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError('User account not found', 404, 'USER_NOT_FOUND');
  }

  // If user already has a local password, verify the current password
  if (user.password_hash) {
    if (!currentPassword) {
      throw new AuthError('Current password is required', 400, 'CURRENT_PASSWORD_REQUIRED');
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      await recordAuditEvent({
        userId: user.id,
        eventType: AUDIT_EVENTS.PASSWORD_CHANGE_FAILED,
        details: { reason: 'Incorrect current password' },
        req
      });
      throw new AuthError('Incorrect current password', 400, 'INVALID_CURRENT_PASSWORD');
    }
  }

  // Validate new password strength
  const strengthError = validatePasswordStrength(newPassword);
  if (strengthError) {
    throw new AuthError(strengthError, 400, 'WEAK_PASSWORD');
  }

  const hash = await bcrypt.hash(newPassword, env.auth.bcryptRounds || 10);
  user.password_hash = hash;
  user.must_change_password = false;
  user.updated_at = new Date();
  await user.save();

  await recordAuditEvent({
    userId: user.id,
    eventType: AUDIT_EVENTS.PASSWORD_CHANGE_SUCCESS,
    req
  });

  const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
  return user.toSafeObject(identities);
}

/**
 * Retrieve current user profile
 */
export async function getCurrentUserProfile(userId) {
  const user = await User.findByPk(userId);
  if (!user) {
    throw new AuthError('User account not found', 404, 'USER_NOT_FOUND');
  }
  const identities = await UserAuthIdentity.findAll({ where: { user_id: user.id } });
  return user.toSafeObject(identities);
}

export default {
  AuthError,
  validatePasswordStrength,
  loginWithCredentials,
  loginWithGoogle,
  linkGoogleAccount,
  unlinkGoogleAccount,
  changePassword,
  getCurrentUserProfile
};
