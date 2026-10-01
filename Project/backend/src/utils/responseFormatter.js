/**
 * Standard JSON Response Formatter
 * Enforces uniform API structure across all endpoints.
 */

export const formatSuccess = (data = null, meta = {}) => ({
  success: true,
  data,
  meta: {
    timestamp: new Date().toISOString(),
    ...meta
  }
});

export const formatError = (message = 'An unexpected error occurred', code = 'INTERNAL_ERROR', details = null) => ({
  success: false,
  error: {
    code,
    message,
    ...(details ? { details } : {})
  },
  timestamp: new Date().toISOString()
});
