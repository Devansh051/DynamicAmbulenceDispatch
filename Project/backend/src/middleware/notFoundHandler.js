import { formatError } from '../utils/responseFormatter.js';

/**
 * 404 Route Not Found Middleware
 */
export const notFoundHandler = (req, res) => {
  return res.status(404).json(
    formatError(`Endpoint not found: ${req.method} ${req.originalUrl}`, 'NOT_FOUND')
  );
};

export default notFoundHandler;
