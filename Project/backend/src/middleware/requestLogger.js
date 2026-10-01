import logger from '../utils/logger.js';

/**
 * Structured HTTP request logging middleware.
 * Tracks incoming requests and execution duration without logging confidential data.
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const logData = {
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip: ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress
    };

    if (statusCode >= 500) {
      logger.error(`HTTP ${method} ${originalUrl} failed`, logData);
    } else if (statusCode >= 400) {
      logger.warn(`HTTP ${method} ${originalUrl} client error`, logData);
    } else {
      logger.info(`HTTP ${method} ${originalUrl} success`, logData);
    }
  });

  next();
};

export default requestLogger;
