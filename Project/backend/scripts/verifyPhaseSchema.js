import assert from 'node:assert/strict';
import env from '../src/config/env.js';
import sequelize from '../src/config/database.js';
import '../src/modules/index.js';
import { up as fleet } from '../src/migrations/006_create_fleet_tracking_tables.js';
import { up as integrity } from '../src/migrations/007_integrity_and_simulation.js';
try {
  await sequelize.authenticate();
  if (process.argv.includes('--apply')) { await fleet(); await integrity(); }
  const [columns] = await sequelize.query(`SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='dbo'`);
  const missing = [];
  for (const model of Object.values(sequelize.models)) for (const [name, attribute] of Object.entries(model.rawAttributes)) {
    if (attribute.type.key === 'VIRTUAL') continue;
    if (!columns.some((column) => column.TABLE_NAME === model.tableName && column.COLUMN_NAME === (attribute.field || name))) missing.push(model.tableName + '.' + name);
  }
  assert.deepEqual(missing, [], 'Every Sequelize field must exist in SQL');
  const required = { Ambulances: ['is_simulated','telemetry_checkpoint_at'], Emergencies: ['version','is_simulated'],
    AmbulanceLocationHistory: ['event_id'], AmbulanceOperationalEvents: ['event_id'], FleetDispatchOutbox: ['event_id'],
    DispatchRecommendations: ['id'], EmergencyEvents: ['id'], IdempotencyRecords: ['id'] };
  for (const [table, fields] of Object.entries(required)) for (const field of fields)
    assert(columns.some((column) => column.TABLE_NAME === table && column.COLUMN_NAME === field), table + '.' + field);
  const [indexes] = await sequelize.query(`SELECT OBJECT_NAME(object_id) AS table_name,name,is_unique,filter_definition FROM sys.indexes WHERE object_id IN (OBJECT_ID('dbo.Emergencies'),OBJECT_ID('dbo.AmbulanceLocationHistory'),OBJECT_ID('dbo.AmbulanceOperationalEvents'),OBJECT_ID('dbo.FleetDispatchOutbox'))`);
  for (const name of ['UQ_Emergencies_ActiveAmbulance','IX_AmbulanceLocationHistory_Ambulance_Time','IX_AmbulanceOperationalEvents_Ambulance_Time','IX_FleetDispatchOutbox_Pending']) assert(indexes.some((index) => index.name === name), name);
  const active = indexes.find((index) => index.name === 'UQ_Emergencies_ActiveAmbulance');
  assert(active.is_unique && active.filter_definition.includes('TRANSPORTING'));
  const [foreignKeys] = await sequelize.query(`SELECT name,OBJECT_NAME(parent_object_id) AS table_name,OBJECT_NAME(referenced_object_id) AS references_table,is_disabled,is_not_trusted FROM sys.foreign_keys`);
  for (const table of ['AmbulanceLocationHistory','AmbulanceOperationalEvents','FleetDispatchOutbox']) assert(foreignKeys.some((key) => key.table_name === table && key.references_table === 'Ambulances' && !key.is_disabled && !key.is_not_trusted), table);
  const [connection] = await sequelize.query("SELECT DB_NAME() AS database_name, CONNECTIONPROPERTY('local_tcp_port') AS tcp_port");
  if (!env.db.instanceName) assert.equal(Number(connection[0].tcp_port), env.db.port, 'Configured DB_PORT is actually used');
  console.log(JSON.stringify({ verified: true, connection: connection[0], model_count: Object.keys(sequelize.models).length, missing_model_columns: missing,
    migrations_reapplied: process.argv.includes('--apply') ? ['006','007'] : [], required, indexes, foreignKeys }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
