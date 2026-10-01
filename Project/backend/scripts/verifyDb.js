import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env files
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
const database = process.env.DB_NAME || 'DynamicAmbulanceDispatch';
const username = process.env.DB_USER || 'ems_user';
const password = process.env.DB_PASSWORD || 'EmsSecurePassword123!';

let host = 'localhost';
let instanceName = undefined;
if (server.includes('\\')) {
  const parts = server.split('\\');
  host = parts[0] || 'localhost';
  instanceName = parts[1];
}

console.log(`[DB Verify] Connecting to SQL Server: host=${host}, instance=${instanceName || '(default)'}, db=${database}, user=${username}`);

const sequelize = new Sequelize(database, username, password, {
  host,
  dialect: 'mssql',
  dialectOptions: {
    options: {
      instanceName,
      encrypt: process.env.DB_ENCRYPT === 'yes' || process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'yes' || process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' || true
    }
  },
  logging: false
});

async function verify() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connection established successfully.');

    const [hospitals] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.Hospitals');
    const [ambulances] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.Ambulances');
    const [routes] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.HospitalRoutes');
    const [patients] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.Patients');
    const [emergencies] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.Emergencies');
    const [zones] = await sequelize.query('SELECT COUNT(*) as count FROM dbo.ServiceZones');

    console.log(`✅ Table Counts verified:`);
    console.log(`   - Hospitals: ${hospitals[0]?.count}`);
    console.log(`   - Ambulances: ${ambulances[0]?.count}`);
    console.log(`   - Routes: ${routes[0]?.count}`);
    console.log(`   - Patients: ${patients[0]?.count}`);
    console.log(`   - Emergencies: ${emergencies[0]?.count}`);
    console.log(`   - Service Zones: ${zones[0]?.count}`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database verification failed:', error.message);
    process.exit(1);
  }
}

verify();
