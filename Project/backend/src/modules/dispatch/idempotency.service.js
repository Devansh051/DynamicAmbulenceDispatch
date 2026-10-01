import crypto from 'crypto';
import IdempotencyRecord from './idempotency.model.js';
import logger from '../../utils/logger.js';

class IdempotencyService {
  /**
   * Generates a deterministic SHA-256 hash of the request payload
   */
  hashPayload(payload) {
    const serialized = JSON.stringify(payload || {}, Object.keys(payload || {}).sort());
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Evaluates if an idempotency key exists and validates payload integrity.
   * If cached: returns cached response.
   * If key conflict with different payload: throws 422 error.
   */
  async checkIdempotency(key, path, payload) {
    if (!key || typeof key !== 'string' || !key.trim()) {
      return { isCached: false };
    }

    const trimmedKey = key.trim();
    const currentHash = this.hashPayload(payload);

    const record = await IdempotencyRecord.findOne({
      where: { idempotency_key: trimmedKey }
    });

    if (record) {
      if (record.request_params_hash !== currentHash) {
        const err = new Error(`Idempotency key '${trimmedKey}' was already used with a different request payload.`);
        err.status = 422;
        err.code = 'IDEMPOTENCY_PAYLOAD_MISMATCH';
        throw err;
      }

      logger.info(`Idempotent request detected for key '${trimmedKey}' on path '${path}'. Serving cached response.`);
      return {
        isCached: true,
        status: record.response_status,
        body: JSON.parse(record.response_body)
      };
    }

    return { isCached: false, key: trimmedKey, hash: currentHash };
  }

  /**
   * Saves execution result for an idempotency key
   */
  async saveIdempotencyRecord({
    key,
    userId,
    path,
    hash,
    status,
    body,
    transaction
  }) {
    if (!key) return null;

    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours retention
      return await IdempotencyRecord.create({
        idempotency_key: key,
        user_id: userId || null,
        request_path: path,
        request_params_hash: hash,
        response_status: status,
        response_body: JSON.stringify(body),
        expires_at: expiresAt
      }, { transaction });
    } catch (err) {
      // In case of race condition inserting same key concurrently
      logger.warn(`Failed to store idempotency record for key '${key}': ${err.message}`);
      return null;
    }
  }
}

export const idempotencyService = new IdempotencyService();
export default idempotencyService;
