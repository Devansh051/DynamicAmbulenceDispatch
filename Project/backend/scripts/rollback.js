import sequelize from '../src/config/database.js';
import { down as downAuth } from '../src/migrations/001_create_auth_tables.js';
import { down as downPhase3 } from '../src/migrations/002_create_phase3_tables.js';
import { down as downPhase4 } from '../src/migrations/003_create_phase4_tables.js';
import { down as downResolutionNotes } from '../src/migrations/004_add_emergency_resolution_notes.js';
import logger from '../src/utils/logger.js';

async function rollbackMigrations() {
  try {
    logger.info('Starting database rollback...');
    await sequelize.authenticate();
    logger.info('Database connection established.');

    await downResolutionNotes();
    await downPhase4();
    if (process.env.ROLLBACK_PHASE3 === 'true' || process.env.ROLLBACK_ALL === 'true') {
      await downPhase3();
    }
    if (process.env.ROLLBACK_ALL === 'true') {
      logger.info('Rolling back Phase 2 auth tables as well...');
      await downAuth();
    }

    logger.info('Rollback executed successfully.');
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('Rollback failed:', { message: error.message, stack: error.stack });
    await sequelize.close().catch(() => {});
    process.exit(1);
  }
}

rollbackMigrations();
