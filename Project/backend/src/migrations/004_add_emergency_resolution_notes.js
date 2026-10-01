import sequelize from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Migration 004: Add dedicated structured resolution_notes column to dbo.Emergencies
 * Non-destructive: Checks sys.columns before altering.
 * Preserves all existing emergency descriptions, historical notes, and C++ compatibility.
 */
export async function up() {
  logger.info('Running migration 004_add_emergency_resolution_notes: UP...');

  await sequelize.query(`
    IF NOT EXISTS (
      SELECT 1 FROM sys.columns 
      WHERE object_id = OBJECT_ID(N'dbo.Emergencies') 
      AND name = N'resolution_notes'
    )
    BEGIN
      ALTER TABLE dbo.Emergencies ADD resolution_notes NVARCHAR(1000) NULL;
    END
  `);

  logger.info('✅ Migration 004_add_emergency_resolution_notes: UP completed.');
}

export async function down() {
  logger.info('Rolling back migration 004_add_emergency_resolution_notes: DOWN...');

  await sequelize.query(`
    IF EXISTS (
      SELECT 1 FROM sys.columns 
      WHERE object_id = OBJECT_ID(N'dbo.Emergencies') 
      AND name = N'resolution_notes'
    )
    BEGIN
      ALTER TABLE dbo.Emergencies DROP COLUMN resolution_notes;
    END
  `);

  logger.info('✅ Migration 004_add_emergency_resolution_notes: DOWN completed.');
}
