import { EventEmitter } from 'events';

export const FLEET_EVENTS = Object.freeze({
  UPDATED: 'fleet:updated',
  HEALTH_CHANGED: 'fleet:health-changed',
  PERSISTENCE_FAILURE: 'fleet:persistence-failure'
});

export const fleetEventBus = new EventEmitter();
fleetEventBus.setMaxListeners(30);

export default fleetEventBus;
