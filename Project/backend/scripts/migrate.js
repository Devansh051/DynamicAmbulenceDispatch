import sequelize from '../src/config/database.js';
import { up as upAuth } from '../src/migrations/001_create_auth_tables.js';
import { up as upPhase3 } from '../src/migrations/002_create_phase3_tables.js';
import { up as upPhase4 } from '../src/migrations/003_create_phase4_tables.js';
import { up as upResolutionNotes } from '../src/migrations/004_add_emergency_resolution_notes.js';
import { up as upPhase5 } from '../src/migrations/005_create_phase5_dispatch_tables.js';
import { up as upFleetTracking } from '../src/migrations/006_create_fleet_tracking_tables.js';
import { up as upIntegrity } from '../src/migrations/007_integrity_and_simulation.js';
import logger from '../src/utils/logger.js';

async function runMigrations() {
  try {
    logger.info('Starting database migration...');
    await sequelize.authenticate();
    logger.info('Database connection established.');

    await upAuth();
    await upPhase3();
    await upPhase4();
    await upResolutionNotes();
    await upPhase5();
    await upFleetTracking();
    await upIntegrity();

    logger.info('All migrations executed successfully.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', { message: error.message, stack: error.stack });
    await sequelize.close().catch(() => {});
    process.exit(1);
  }
}

runMigrations();
