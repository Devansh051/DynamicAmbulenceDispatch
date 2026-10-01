/**
 * Structured Logger for EMS Command Center Backend
 * Provides ISO timestamped, leveled JSON/structured console output
 * without exposing credentials or sensitive patient data.
 */

const formatMessage = (level, message, meta = {}) => {
  // Sanitize meta to prevent sensitive data leakage
  const safeMeta = { ...meta };
  if (safeMeta.password) safeMeta.password = '[REDACTED]';
  if (safeMeta.DB_PASSWORD) safeMeta.DB_PASSWORD = '[REDACTED]';
  if (safeMeta.phoneNumber) safeMeta.phoneNumber = '[REDACTED]';

  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(Object.keys(safeMeta).length > 0 ? { meta: safeMeta } : {})
  };
};

export const logger = {
  info(message, meta) {
    console.log(JSON.stringify(formatMessage('INFO', message, meta)));
  },
  warn(message, meta) {
    console.warn(JSON.stringify(formatMessage('WARN', message, meta)));
  },
  error(message, meta) {
    console.error(JSON.stringify(formatMessage('ERROR', message, meta)));
  },
  debug(message, meta) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(JSON.stringify(formatMessage('DEBUG', message, meta)));
    }
  }
};

export default logger;
