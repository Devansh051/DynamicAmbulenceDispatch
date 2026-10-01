import { formatError } from '../utils/responseFormatter.js';

/**
 * Higher-order middleware for request validation.
 * Accepts a validator function or schema and checks req.body, req.query, or req.params.
 */
export const validateRequest = (validator) => {
  return (req, res, next) => {
    try {
      if (typeof validator === 'function') {
        const error = validator(req);
        if (error) {
          return res.status(400).json(formatError(error, 'VALIDATION_ERROR'));
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
};

export default validateRequest;
