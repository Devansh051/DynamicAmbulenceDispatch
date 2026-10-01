import { OAuth2Client } from 'google-auth-library';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';

let oauthClient = null;

function getOAuthClient() {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(env.auth.googleClientId || '');
  }
  return oauthClient;
}

// For unit testing: allow injecting a mock verifier
let customVerifier = null;
export function setMockGoogleVerifier(verifier) {
  customVerifier = verifier;
}

/**
 * Verifies a Google ID token from Google Identity Services (GIS).
 *
 * @param {string} idToken - The Google ID credential JWT.
 * @returns {Promise<{ sub: string, email: string, email_verified: boolean, name: string, picture: string }>}
 */
export async function verifyGoogleIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required');
  }

  // If a mock verifier has been set for testing, use it
  if (customVerifier) {
    return await customVerifier(idToken);
  }

  if (!env.auth.googleClientId) {
    throw new Error('Google Client ID is not configured on the server (GOOGLE_CLIENT_ID missing)');
  }

  try {
    const client = getOAuthClient();
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.auth.googleClientId
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid Google credential payload');
    }

    // Validate Issuer
    const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
    if (!validIssuers.includes(payload.iss)) {
      throw new Error(`Invalid token issuer: ${payload.iss}`);
    }

    // Validate Subject claim
    if (!payload.sub) {
      throw new Error('Missing Google subject (sub) claim');
    }

    // Validate Email claim
    if (!payload.email) {
      throw new Error('Missing Google email claim');
    }

    return {
      sub: String(payload.sub),
      email: String(payload.email).trim().toLowerCase(),
      email_verified: Boolean(payload.email_verified),
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || null
    };
  } catch (error) {
    logger.warn('Google ID token verification failed:', { error: error.message });
    throw new Error(`Google token verification failed: ${error.message}`);
  }
}

export default {
  verifyGoogleIdToken,
  setMockGoogleVerifier
};
