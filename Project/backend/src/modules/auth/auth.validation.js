/**
 * Request validation helper functions for Authentication module
 */

export function validateLoginRequest(req) {
  const { email, password } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'A valid email address is required';
  }
  if (!password || typeof password !== 'string') {
    return 'Password is required';
  }
  return null;
}

export function validateGoogleAuthRequest(req) {
  const credential = req.body?.credential || req.body?.idToken;
  if (!credential || typeof credential !== 'string') {
    return 'Google ID token credential is required';
  }
  return null;
}

export function validateChangePasswordRequest(req) {
  const { newPassword } = req.body || {};
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return 'New password must be at least 8 characters long';
  }
  return null;
}

export default {
  validateLoginRequest,
  validateGoogleAuthRequest,
  validateChangePasswordRequest
};
