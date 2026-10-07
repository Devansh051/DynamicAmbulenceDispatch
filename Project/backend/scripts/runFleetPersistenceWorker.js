import logger from '../src/utils/logger.js';
import sequelize from '../src/config/database.js';
import { registerShutdown } from '../src/utils/shutdown.js';
import fleetStateStore from '../src/modules/fleet/fleetState.store.js';
import FleetPersistenceWorker from '../src/modules/fleet/fleetPersistence.worker.js';

const worker = new FleetPersistenceWorker();

async function start() {
  await fleetStateStore.init();
  worker.start();
  logger.info(`Fleet persistence worker active (Redis ${fleetStateStore.isRedisReady() ? 'connected' : 'unavailable; waiting for reconnect'}).`);
}

registerShutdown([
  ['fleet persistence', () => worker.stop({ drain: true })],
  ['Redis', () => fleetStateStore.close()],
  ['SQL pool', () => sequelize.close()]
]);
start().catch((error) => {
  logger.error('Unable to start fleet persistence worker:', { message: error.message });
  process.exit(1);
});
