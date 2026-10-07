import logger from '../src/utils/logger.js';
import fleetStateStore from '../src/modules/fleet/fleetState.store.js';
import fleetSimulator from '../src/modules/fleet/fleetSimulator.service.js';
import sequelize from '../src/config/database.js';
import { registerShutdown } from '../src/utils/shutdown.js';

async function start() {
  await fleetStateStore.init();
  await fleetSimulator.start();
}

registerShutdown([
  ['simulator', () => fleetSimulator.stop()],
  ['Redis', () => fleetStateStore.close()],
  ['SQL pool', () => sequelize.close()]
]);
start().catch((error) => {
  logger.error('Unable to start fleet simulator:', { message: error.message });
  process.exit(1);
});
