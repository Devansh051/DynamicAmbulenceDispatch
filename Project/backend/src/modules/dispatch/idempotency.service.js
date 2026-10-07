import crypto from 'crypto';
import sequelize from '../../config/database.js';
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
  async checkIdempotency(key, path, payload, userId = null, transaction = null) {
    if (!key || typeof key !== 'string' || !key.trim()) {
      return { isCached: false };
    }

    const trimmedKey = key.trim();
    if (trimmedKey.length > 100) throw Object.assign(new Error('Idempotency key exceeds 100 characters.'), { status: 400 });
    if (transaction) {
      const [rows] = await sequelize.query(`DECLARE @result INT;
        EXEC @result = sp_getapplock @Resource = :resource, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 10000;
        SELECT @result AS result;`, { replacements: { resource: 'idempotency:' + crypto.createHash('sha256').update(trimmedKey).digest('hex') }, transaction });
      if (rows[0]?.result < 0) throw Object.assign(new Error('An identical command is in progress. Retry shortly.'), { status: 409 });
    }
    const currentHash = this.hashPayload(payload);

    const record = await IdempotencyRecord.findOne({
      where: { idempotency_key: trimmedKey }, transaction
    });

    if (record) {
      if (record.request_path !== path || (userId !== null && Number(record.user_id) !== Number(userId))) {
        throw Object.assign(new Error('Idempotency key belongs to another request.'), { status: 409, code: 'IDEMPOTENCY_SCOPE_MISMATCH' });
      }
      if (new Date(record.expires_at).getTime() <= Date.now()) return { isCached: false };
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
      const values = {
        idempotency_key: key.trim(),
        user_id: userId || null,
        request_path: path,
        request_params_hash: hash,
        response_status: status,
        response_body: JSON.stringify(body),
        expires_at: expiresAt
      };
      const existing = await IdempotencyRecord.findOne({ where: { idempotency_key: key.trim() }, transaction });
      return existing ? await existing.update(values, { transaction }) : await IdempotencyRecord.create(values, { transaction });
    } catch (err) {
      // In case of race condition inserting same key concurrently
      throw err; // Roll back the command if its durable replay record cannot be stored.
    }
  }
}

export const idempotencyService = new IdempotencyService();
export default idempotencyService;
