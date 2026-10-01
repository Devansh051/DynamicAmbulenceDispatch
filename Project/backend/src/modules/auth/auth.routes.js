import { Router } from 'express';
import authController from './auth.controller.js';
import authenticate from '../../middleware/authenticate.js';
import validateRequest from '../../middleware/validateRequest.js';
import {
  validateLoginRequest,
  validateGoogleAuthRequest,
  validateChangePasswordRequest
} from './auth.validation.js';
import {
  loginRateLimiter,
  googleAuthRateLimiter,
  passwordChangeRateLimiter
} from '../../middleware/rateLimit.js';

const router = Router();

// POST /api/v1/auth/login - Local email & password login
router.post(
  '/login',
  loginRateLimiter,
  validateRequest(validateLoginRequest),
  authController.login
);

// POST /api/v1/auth/google - Google Sign-In with GIS ID token
router.post(
  '/google',
  googleAuthRateLimiter,
  validateRequest(validateGoogleAuthRequest),
  authController.googleLogin
);

// POST /api/v1/auth/logout - Invalidate session & clear cookies
router.post(
  '/logout',
  authenticate,
  authController.logout
);

// GET /api/v1/auth/me - Retrieve current authenticated user profile
router.get(
  '/me',
  authenticate,
  authController.getMe
);

// POST /api/v1/auth/change-password - Change user password
router.post(
  '/change-password',
  authenticate,
  passwordChangeRateLimiter,
  validateRequest(validateChangePasswordRequest),
  authController.changePassword
);

// POST /api/v1/auth/google/link - Link Google identity to authenticated account
router.post(
  '/google/link',
  authenticate,
  validateRequest(validateGoogleAuthRequest),
  authController.linkGoogle
);

// DELETE /api/v1/auth/google/link - Unlink Google identity from authenticated account
router.delete(
  '/google/link',
  authenticate,
  authController.unlinkGoogle
);

export default router;
