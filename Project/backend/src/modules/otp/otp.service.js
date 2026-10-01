import logger from '../../utils/logger.js';

/**
 * In-memory OTP service with 10-minute time-based verification window
 * Mirrors legacy C++ confirmOTP() pseudo-random 6-digit verification workflow
 */
class OtpService {
  constructor() {
    this.otpStore = new Map();
    this.otpTtlMs = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Generate a 6-digit numeric OTP for an emergency dispatch action
   */
  generateDispatchOtp(emergencyId, { generatedBy = 'SYSTEM' } = {}) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + this.otpTtlMs);

    this.otpStore.set(String(emergencyId), {
      code,
      expiresAt,
      generatedBy,
      generatedAt: new Date(),
      verified: false
    });

    logger.info(`[OtpService] Generated 6-digit dispatch confirmation OTP for emergency #${emergencyId} (Expires in 10 mins).`);
    return {
      success: true,
      otp: code,
      expires_at: expiresAt,
      ttl_seconds: Math.round(this.otpTtlMs / 1000),
      expires_in_seconds: Math.round(this.otpTtlMs / 1000)
    };
  }

  /**
   * Verify provided OTP against active emergency dispatch record
   */
  verifyDispatchOtp(emergencyId, inputOtp) {
    const key = String(emergencyId);
    const entry = this.otpStore.get(key);

    if (!entry) {
      return {
        valid: false,
        reason: 'NO_OTP_REQUESTED',
        message: 'No dispatch confirmation OTP found for this incident. Please request a new OTP.'
      };
    }

    if (Date.now() > entry.expiresAt.getTime()) {
      this.otpStore.delete(key);
      return {
        valid: false,
        reason: 'OTP_EXPIRED',
        message: 'Dispatch confirmation OTP has expired. Please request a fresh OTP.'
      };
    }

    if (String(entry.code).trim() !== String(inputOtp).trim()) {
      return {
        valid: false,
        reason: 'INVALID_CODE',
        message: 'Incorrect 6-digit confirmation OTP. Verification failed.'
      };
    }

    // OTP verified successfully - clear from store to prevent reuse
    this.otpStore.delete(key);
    return {
      valid: true,
      message: 'Dispatch OTP confirmed successfully.'
    };
  }

  /**
   * Check if an active OTP exists for the emergency
   */
  hasPendingOtp(emergencyId) {
    const entry = this.otpStore.get(String(emergencyId));
    if (!entry) return false;
    if (Date.now() > entry.expiresAt.getTime()) {
      this.otpStore.delete(String(emergencyId));
      return false;
    }
    return true;
  }
}

export const otpService = new OtpService();
export default otpService;
