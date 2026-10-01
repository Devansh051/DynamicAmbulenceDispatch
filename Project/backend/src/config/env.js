import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
let host = 'localhost';
let instanceName = undefined;

if (server.includes('\\')) {
  const parts = server.split('\\');
  host = parts[0] || 'localhost';
  instanceName = parts[1];
} else if (server.includes(':')) {
  const parts = server.split(':');
  host = parts[0] || 'localhost';
} else {
  host = server;
}

export const env = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  db: {
    server,
    host,
    instanceName,
    database: process.env.DB_NAME || 'DynamicAmbulanceDispatch',
    user: process.env.DB_USER || 'ems_user',
    password: process.env.DB_PASSWORD || 'EmsSecurePassword123!',
    driver: process.env.DB_DRIVER || 'ODBC Driver 18 for SQL Server',
    encrypt: process.env.DB_ENCRYPT === 'yes' || process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'no' && process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false'
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'ems_dev_jwt_secret_key_super_secure_32_chars_min',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
    cookieName: process.env.COOKIE_NAME || 'ems_session',
    cookieSecret: process.env.COOKIE_SECRET || 'ems_cookie_secret_dev_key',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 10,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleSignupMode: (process.env.GOOGLE_SIGNUP_MODE || 'disabled').toLowerCase() // 'disabled' or 'pending'
  },
  dataGov: {
    apiKey: (process.env.DATA_GOV_API_KEY || '').trim(),
    resourceId: (process.env.DATA_GOV_RESOURCE_ID || 'nin-health-faclities-geo-code-and-additional-parameters-updated-till-last-month').trim(),
    syncIntervalDays: parseInt(process.env.DATA_GOV_SYNC_INTERVAL_DAYS, 10) || 3,
    syncEnabled: process.env.HOSPITAL_SYNC_ENABLED !== 'false' && process.env.HOSPITAL_SYNC_ENABLED !== '0',
    baseUrl: (process.env.DATA_GOV_BASE_URL || 'https://api.data.gov.in/resource/').trim()
  },
  googleMaps: {
    apiKey: (process.env.GOOGLE_MAPS_API_KEY || '').trim(),
    browserApiKey: (process.env.GOOGLE_MAPS_BROWSER_API_KEY || '').trim(),
    searchRadiusMeters: parseInt(process.env.GOOGLE_MAPS_SEARCH_RADIUS_METERS, 10) || 15000,
    region: (process.env.GOOGLE_MAPS_REGION || 'in').trim()
  }
};

export default env;
