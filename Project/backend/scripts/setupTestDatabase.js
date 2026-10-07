import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import env from '../src/config/env.js';

const database = process.env.TEST_DB_NAME || 'DynamicAmbulanceDispatch_Test';
if (!/^[A-Za-z][A-Za-z0-9_]*_Test$/.test(database)) throw new Error('TEST_DB_NAME must end in _Test and contain only identifier characters.');
if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(env.db.user)) throw new Error('Configure a simple SQL login name for test database ownership.');
const directory = path.dirname(fileURLToPath(import.meta.url));
const legacy = fs.readFileSync(path.resolve(directory, '../../Legacy/database_schema.sql'), 'utf8');
const sql = legacy.replaceAll('DynamicAmbulanceDispatch', database) +
  '\nGO\nIF USER_ID(N\'' + env.db.user + '\') IS NULL CREATE USER [' + env.db.user + '] FOR LOGIN [' + env.db.user + '];\n' +
  'ALTER ROLE db_owner ADD MEMBER [' + env.db.user + '];\n';
const file = path.join(os.tmpdir(), 'ems-test-bootstrap-' + Date.now() + '.sql');
fs.writeFileSync(file, sql);
try { execFileSync('sqlcmd', ['-S', env.db.instanceName ? env.db.server : env.db.host + ',' + env.db.port, '-E', '-C', '-b', '-i', file], { stdio: 'inherit' }); }
finally { fs.unlinkSync(file); }
console.log('Created/initialized isolated database: ' + database + '. Set DB_NAME to this value and run scripts/migrate.js.');
