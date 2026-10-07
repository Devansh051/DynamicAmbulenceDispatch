import authService, { AuthError } from './auth.service.js';
import sessionService from './session.service.js';
import { recordAuditEvent, AUDIT_EVENTS } from '../audit/audit.service.js';
import { formatSuccess, formatError } from '../../utils/responseFormatter.js';

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginWithCredentials({ email, password, req });

    sessionService.attachSessionCookie(res, result.token);

    return res.status(200).json(formatSuccess(result, { message: 'Authentication successful' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const googleLogin = async (req, res, next) => {
  try {
    const idToken = req.body.credential || req.body.idToken;
    const result = await authService.loginWithGoogle({ idToken, req });

    sessionService.attachSessionCookie(res, result.token);

    return res.status(200).json(formatSuccess(result, { message: 'Google authentication successful' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    if (req.token) {
      await sessionService.invalidateSessionToken(req.token);
    }
    sessionService.clearSessionCookie(res);

    if (req.user) {
      await recordAuditEvent({
        userId: req.user.id,
        eventType: AUDIT_EVENTS.LOGOUT,
        req
      });
    }

    return res.status(200).json(formatSuccess({ message: 'Session logged out and invalidated successfully' }));
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const userProfile = await authService.getCurrentUserProfile(req.user.id);
    return res.status(200).json(formatSuccess(userProfile));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const updatedUser = await authService.changePassword({
      userId: req.user.id,
      currentPassword,
      newPassword,
      req
    });

    return res.status(200).json(formatSuccess(updatedUser, { message: 'Password updated successfully' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const linkGoogle = async (req, res, next) => {
  try {
    const idToken = req.body.credential || req.body.idToken;
    const updatedUser = await authService.linkGoogleAccount({
      userId: req.user.id,
      idToken,
      req
    });

    return res.status(200).json(formatSuccess(updatedUser, { message: 'Google account linked successfully' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const unlinkGoogle = async (req, res, next) => {
  try {
    const updatedUser = await authService.unlinkGoogleAccount({
      userId: req.user.id,
      req
    });

    return res.status(200).json(formatSuccess(updatedUser, { message: 'Google account unlinked successfully' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export default {
  login,
  googleLogin,
  logout,
  getMe,
  changePassword,
  linkGoogle,
  unlinkGoogle
};
