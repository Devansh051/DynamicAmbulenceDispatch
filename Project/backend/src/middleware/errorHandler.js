import logger from '../utils/logger.js';
import { formatError } from '../utils/responseFormatter.js';
import env from '../config/env.js';

/**
 * Centralized Error-Handling Middleware
 * Catches all thrown/unhandled errors and formats them into standard JSON responses.
 */
export const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected internal server error occurred';

  logger.error(`Unhandled error processing ${req.method} ${req.originalUrl}: ${message}`, {
    stack: env.nodeEnv === 'development' ? err.stack : undefined,
    code: errorCode,
    statusCode
  });

  const details = env.nodeEnv === 'development' ? { stack: err.stack } : null;

  return res.status(statusCode).json(formatError(message, errorCode, details));
};

export default errorHandler;
