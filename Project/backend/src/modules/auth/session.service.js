import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../../config/env.js';
import fleetStateStore from '../fleet/fleetState.store.js';

// In-memory token revocation blacklist (keyed by jti or token with expiration timestamp)
const revokedTokens = new Map();

// Periodic cleanup of expired entries in blacklist
setInterval(() => {
  const now = Date.now();
  for (const [tokenKey, exp] of revokedTokens.entries()) {
    if (exp <= now) {
      revokedTokens.delete(tokenKey);
    }
  }
}, 5 * 60 * 1000).unref(); // unref so it does not block process exit

const ISSUER = 'dynamic-ambulance-dispatch';
const AUDIENCE = 'ems-operations';

/**
 * Creates a signed JWT for the authenticated application user.
 */
export function createSessionToken(user) {
  const jti = crypto.randomUUID();
  const payload = {
    sub: String(user.id),
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    must_change_password: Boolean(user.must_change_password)
  };

  const options = {
    algorithm: 'HS256',
    expiresIn: env.auth.jwtExpiresIn || '2h',
    issuer: ISSUER,
    audience: AUDIENCE,
    jwtid: jti
  };

  const token = jwt.sign(payload, env.auth.jwtSecret, options);
  return { token, jti };
}

/**
 * Verifies a JWT token strictly enforcing HS256 algorithm, issuer, and audience.
 */
export function verifySessionToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token missing or invalid format' };
    }

    // Check if token is in blacklist
    if (revokedTokens.has(token)) {
      return { valid: false, error: 'Session has been invalidated/logged out' };
    }

    const decoded = jwt.verify(token, env.auth.jwtSecret, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE
    });

    if (decoded.jti && revokedTokens.has(decoded.jti)) {
      return { valid: false, error: 'Session has been revoked' };
    }

    return { valid: true, payload: decoded };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return { valid: false, expired: true, error: 'Session token has expired' };
    }
    return { valid: false, error: error.message };
  }
}

const revocationKey = (token) => fleetStateStore.key('auth:revoked:' + crypto.createHash('sha256').update(token).digest('hex'));
const requireRevocationStore = () => {
  if (!fleetStateStore.isRedisReady()) throw Object.assign(new Error('Session verification storage is unavailable.'), { status: 503, code: 'AUTH_STATE_UNAVAILABLE' });
};

// Entry points use the shared check; per-event socket expiry checks remain local.
export async function verifyActiveSessionToken(token) {
  const verification = verifySessionToken(token);
  if (!verification.valid) return verification;
  requireRevocationStore();
  if (await fleetStateStore.client.exists(revocationKey(token))) {
    return { valid: false, error: 'Session has been revoked' };
  }
  return verification;
}

/** Revocations survive backend restarts and are shared by API instances. */
export async function invalidateSessionToken(token) {
  const decoded = jwt.decode(token);
  const expMs = decoded?.exp ? decoded.exp * 1000 : Date.now() + 2 * 60 * 60 * 1000;
  if (decoded?.jti) revokedTokens.set(decoded.jti, expMs);
  revokedTokens.set(token, expMs);
  requireRevocationStore();
  await fleetStateStore.client.set(revocationKey(token), '1', { PX: Math.max(1, expMs - Date.now()) });
  return true;
}

/**
 * Attaches the session cookie to the Express response.
 */
export function attachSessionCookie(res, token) {
  const isProduction = env.nodeEnv === 'production';
  res.cookie(env.auth.cookieName || 'ems_session', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 2 * 60 * 60 * 1000, // 2 hours
    path: '/'
  });
}

/**
 * Clears the session cookie on logout.
 */
export function clearSessionCookie(res) {
  const isProduction = env.nodeEnv === 'production';
  res.clearCookie(env.auth.cookieName || 'ems_session', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/'
  });
}

/**
 * Extracts session token from either Authorization header (Bearer) or HttpOnly cookie.
 */
export function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.cookies && req.cookies[env.auth.cookieName || 'ems_session']) {
    return req.cookies[env.auth.cookieName || 'ems_session'];
  }
  return null;
}

export default {
  createSessionToken,
  verifySessionToken,
  verifyActiveSessionToken,
  invalidateSessionToken,
  attachSessionCookie,
  clearSessionCookie,
  extractToken
};
