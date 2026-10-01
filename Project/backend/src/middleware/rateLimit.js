import rateLimit from 'express-rate-limit';
import env from '../config/env.js';
import { formatError } from '../utils/responseFormatter.js';

const isTest = env.nodeEnv === 'test';

const createLimiter = ({ windowMs, max, message }) => {
  return rateLimit({
    windowMs,
    max: isTest ? 1000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(formatError(message, 'RATE_LIMIT_EXCEEDED'));
    }
  });
};

export const loginRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again after 15 minutes.'
});

export const googleAuthRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many Google authentication attempts. Please try again after 15 minutes.'
});

export const passwordChangeRateLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password change attempts. Please try again after 15 minutes.'
});

export default {
  loginRateLimiter,
  googleAuthRateLimiter,
  passwordChangeRateLimiter
};
