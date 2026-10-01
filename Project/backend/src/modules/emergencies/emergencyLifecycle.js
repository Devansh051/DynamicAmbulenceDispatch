import { EMERGENCY_STATUS } from './emergency.model.js';
import { USER_ROLES } from '../users/user.model.js';

/**
 * Valid Status Transitions Matrix
 */
export const LIFECYCLE_TRANSITIONS = Object.freeze({
  [EMERGENCY_STATUS.REPORTED]: [
    EMERGENCY_STATUS.VERIFIED,
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.VERIFIED]: [
    EMERGENCY_STATUS.DISPATCH_RECOMMENDED,
    EMERGENCY_STATUS.DISPATCHED,
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.DISPATCH_RECOMMENDED]: [
    EMERGENCY_STATUS.DISPATCHED,
    EMERGENCY_STATUS.VERIFIED, // allows recalculation/reverting
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.DISPATCHED]: [
    EMERGENCY_STATUS.EN_ROUTE,
    EMERGENCY_STATUS.RESOLVED,
    EMERGENCY_STATUS.DISPATCHED, // Reassignment
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.EN_ROUTE]: [
    EMERGENCY_STATUS.AT_PATIENT,
    EMERGENCY_STATUS.RESOLVED,
    EMERGENCY_STATUS.DISPATCHED, // Reassignment due to breakdown/rerouting
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.AT_PATIENT]: [
    EMERGENCY_STATUS.TRANSPORTING,
    EMERGENCY_STATUS.RESOLVED, // Treated on scene without transport
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.TRANSPORTING]: [
    EMERGENCY_STATUS.AT_HOSPITAL,
    EMERGENCY_STATUS.CANCELLED
  ],
  [EMERGENCY_STATUS.AT_HOSPITAL]: [
    EMERGENCY_STATUS.RESOLVED
  ],
  [EMERGENCY_STATUS.RESOLVED]: [
    EMERGENCY_STATUS.CLOSED
  ],
  [EMERGENCY_STATUS.CLOSED]: [],
  [EMERGENCY_STATUS.CANCELLED]: []
});

/**
 * Role Permission Matrix for Lifecycle Transitions
 */
export const TRANSITION_ROLE_PERMISSIONS = Object.freeze({
  [EMERGENCY_STATUS.VERIFIED]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER],
  [EMERGENCY_STATUS.DISPATCH_RECOMMENDED]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER],
  [EMERGENCY_STATUS.DISPATCHED]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER],
  [EMERGENCY_STATUS.EN_ROUTE]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW],
  [EMERGENCY_STATUS.AT_PATIENT]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW],
  [EMERGENCY_STATUS.TRANSPORTING]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW],
  [EMERGENCY_STATUS.AT_HOSPITAL]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW],
  [EMERGENCY_STATUS.RESOLVED]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER, USER_ROLES.AMBULANCE_CREW],
  [EMERGENCY_STATUS.CLOSED]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER],
  [EMERGENCY_STATUS.CANCELLED]: [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER]
});

/**
 * Checks if status transition is allowed by state machine
 */
export function isValidTransition(fromStatus, toStatus) {
  const from = (fromStatus || '').toUpperCase();
  const to = (toStatus || '').toUpperCase();
  if (from === to) return true; // Idempotent same-state check
  const allowed = LIFECYCLE_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Retrieves valid next transitions for a given status
 */
export function getNextAllowedTransitions(status) {
  const current = (status || '').toUpperCase();
  return LIFECYCLE_TRANSITIONS[current] || [];
}

/**
 * Validates role authorization for a lifecycle state transition
 */
export function authorizeTransition(userRole, toStatus) {
  const target = (toStatus || '').toUpperCase();
  const authorizedRoles = TRANSITION_ROLE_PERMISSIONS[target] || [USER_ROLES.ADMIN, USER_ROLES.DISPATCHER];
  return authorizedRoles.includes(userRole);
}

/**
 * Checks whether an emergency status is active (has an ongoing response)
 */
export function isActiveResponseStatus(status) {
  return [
    EMERGENCY_STATUS.DISPATCH_RECOMMENDED,
    EMERGENCY_STATUS.DISPATCHED,
    EMERGENCY_STATUS.EN_ROUTE,
    EMERGENCY_STATUS.AT_PATIENT,
    EMERGENCY_STATUS.TRANSPORTING,
    EMERGENCY_STATUS.AT_HOSPITAL
  ].includes((status || '').toUpperCase());
}

/**
 * Checks whether the status frees the ambulance
 */
export function shouldReleaseAmbulance(toStatus) {
  return [
    EMERGENCY_STATUS.RESOLVED,
    EMERGENCY_STATUS.CLOSED,
    EMERGENCY_STATUS.CANCELLED
  ].includes((toStatus || '').toUpperCase());
}

export default {
  LIFECYCLE_TRANSITIONS,
  TRANSITION_ROLE_PERMISSIONS,
  isValidTransition,
  getNextAllowedTransitions,
  authorizeTransition,
  isActiveResponseStatus,
  shouldReleaseAmbulance
};
