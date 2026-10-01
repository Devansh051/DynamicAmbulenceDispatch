import AuthAuditLog from './audit.model.js';
import logger from '../../utils/logger.js';

export const AUDIT_EVENTS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  GOOGLE_LOGIN_SUCCESS: 'GOOGLE_LOGIN_SUCCESS',
  GOOGLE_LOGIN_FAILED: 'GOOGLE_LOGIN_FAILED',
  GOOGLE_SIGNUP_PENDING: 'GOOGLE_SIGNUP_PENDING',
  GOOGLE_LINK_SUCCESS: 'GOOGLE_LINK_SUCCESS',
  GOOGLE_LINK_FAILED: 'GOOGLE_LINK_FAILED',
  GOOGLE_UNLINK_SUCCESS: 'GOOGLE_UNLINK_SUCCESS',
  PASSWORD_CHANGE_SUCCESS: 'PASSWORD_CHANGE_SUCCESS',
  PASSWORD_CHANGE_FAILED: 'PASSWORD_CHANGE_FAILED',
  USER_PROVISIONED: 'USER_PROVISIONED',
  USER_UPDATED: 'USER_UPDATED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_APPROVED: 'USER_APPROVED',
  USER_REJECTED: 'USER_REJECTED',
  EMERGENCY_REPORTED: 'EMERGENCY_REPORTED',
  EMERGENCY_UPDATED: 'EMERGENCY_UPDATED',
  EMERGENCY_STATUS_CHANGED: 'EMERGENCY_STATUS_CHANGED',
  EMERGENCY_DISPATCHED: 'EMERGENCY_DISPATCHED',
  EMERGENCY_RESOLVED: 'EMERGENCY_RESOLVED',
  EMERGENCY_CANCELLED: 'EMERGENCY_CANCELLED',
  AMBULANCE_CREATED: 'AMBULANCE_CREATED',
  AMBULANCE_UPDATED: 'AMBULANCE_UPDATED',
  AMBULANCE_STATUS_CHANGED: 'AMBULANCE_STATUS_CHANGED',
  AMBULANCE_DISPATCHED: 'AMBULANCE_DISPATCHED',
  AMBULANCE_RELEASED: 'AMBULANCE_RELEASED'
};

/**
 * Records a security / domain audit event in the database.
 * Never logs raw credentials, tokens, hashes, or sensitive patient identifying info.
 */
export async function recordAuditEvent(params) {
  if (auditService && auditService.log && auditService.log !== recordAuditEvent) {
    return auditService.log(params);
  }
  if (auditService && auditService.recordAuditEvent && auditService.recordAuditEvent !== recordAuditEvent) {
    return auditService.recordAuditEvent(params);
  }

  const { userId = null, eventType, details = null, req = null, transaction = null } = params;
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null) : null;
    const userAgent = req ? (req.headers['user-agent'] || null) : null;

    let detailsString = null;
    if (typeof details === 'object' && details !== null) {
      // Remove any sensitive credentials or protected patient health info
      const sanitized = { ...details };
      delete sanitized.password;
      delete sanitized.password_hash;
      delete sanitized.token;
      delete sanitized.idToken;
      delete sanitized.credential;
      delete sanitized.secret;

      // Protect sensitive patient data - explicitly redact
      if (sanitized.patient_name !== undefined && sanitized.patient_name !== null) sanitized.patient_name = '[REDACTED]';
      if (sanitized.patientName !== undefined && sanitized.patientName !== null) sanitized.patientName = '[REDACTED]';
      if (sanitized.contact_phone !== undefined && sanitized.contact_phone !== null) sanitized.contact_phone = '[REDACTED]';
      if (sanitized.phone_number !== undefined && sanitized.phone_number !== null) sanitized.phone_number = '[REDACTED]';
      if (sanitized.phoneNumber !== undefined && sanitized.phoneNumber !== null) sanitized.phoneNumber = '[REDACTED]';
      if (sanitized.clinical_condition !== undefined && sanitized.clinical_condition !== null) sanitized.clinical_condition = '[REDACTED]';
      if (sanitized.condition !== undefined && sanitized.condition !== null) sanitized.condition = '[REDACTED]';
      if (sanitized.medical_history !== undefined && sanitized.medical_history !== null) sanitized.medical_history = '[REDACTED]';

      detailsString = JSON.stringify(sanitized).slice(0, 1000);
    } else if (typeof details === 'string') {
      // Redact potential phone numbers or sensitive keywords from string details
      detailsString = details
        .replace(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[REDACTED_PHONE]')
        .slice(0, 1000);
    }

    return await AuthAuditLog.create({
      user_id: userId,
      event_type: eventType,
      details: detailsString,
      ip_address: ipAddress ? String(ipAddress).slice(0, 45) : null,
      user_agent: userAgent ? String(userAgent).slice(0, 255) : null
    }, transaction ? { transaction } : {});
  } catch (error) {
    logger.error('Failed to record audit event:', {
      eventType,
      userId,
      error: error.message
    });
    // When part of an atomic transaction, rethrow to trigger rollback
    if (transaction) {
      throw error;
    }
  }
}

const auditService = {
  AUDIT_EVENTS,
  recordAuditEvent,
  log: recordAuditEvent,
  logEvent: recordAuditEvent,
  logSecurityEvent: recordAuditEvent
};

export default auditService;
