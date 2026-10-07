import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const asBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return ['true', '1', 'yes'].includes(String(value).toLowerCase());
};

const asPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Load environment variables from backend/.env or root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const server = process.env.DB_SERVER || 'localhost\\SQLEXPRESS';
let host = 'localhost';
let instanceName = undefined;
let port = Number(process.env.DB_PORT) || 1433;

if (server.includes('\\')) {
  const parts = server.split('\\');
  host = parts[0] || 'localhost';
  instanceName = parts[1];
} else if (server.includes(':')) {
  const parts = server.split(':');
  host = parts[0] || 'localhost';
  port = Number(parts[1]) || port;
} else {
  host = server;
}

// Tedious resolves instanceName through SQL Browser and ignores the TCP port.
// An explicit DB_PORT therefore selects a direct TCP connection.
if (process.env.DB_PORT) {
  port = Number(process.env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be an integer between 1 and 65535.');
  instanceName = undefined;
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
    port,
    database: process.env.DB_NAME || 'DynamicAmbulanceDispatch',
    user: process.env.DB_USER || 'ems_user',
    password: process.env.DB_PASSWORD || '',
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
  },
  fleet: {
    redisUrl: (process.env.REDIS_URL || 'redis://127.0.0.1:6379').trim(),
    redisConnectTimeoutMs: asPositiveInt(process.env.REDIS_CONNECT_TIMEOUT_MS, 3000),
    redisPrefix: (process.env.FLEET_REDIS_PREFIX || 'ems:fleet:v1').trim(),
    heartbeatIntervalMs: asPositiveInt(process.env.FLEET_HEARTBEAT_INTERVAL_MS, 10000),
    locationStaleMs: asPositiveInt(process.env.FLEET_LOCATION_STALE_MS, 45000),
    offlineMs: asPositiveInt(process.env.FLEET_OFFLINE_MS, 90000),
    socketBroadcastIntervalMs: asPositiveInt(process.env.FLEET_SOCKET_BROADCAST_INTERVAL_MS, 1000),
    telemetryMaxEventsPerMinute: asPositiveInt(process.env.FLEET_TELEMETRY_MAX_EVENTS_PER_MINUTE, 120),
    telemetryMaxPayloadBytes: asPositiveInt(process.env.FLEET_TELEMETRY_MAX_PAYLOAD_BYTES, 16384),
    persistenceWorkerEnabled: asBoolean(process.env.FLEET_PERSISTENCE_WORKER_ENABLED),
    persistenceBatchSize: asPositiveInt(process.env.FLEET_PERSISTENCE_BATCH_SIZE, 100),
    persistenceSampleMs: asPositiveInt(process.env.FLEET_PERSISTENCE_SAMPLE_MS, 30000),
    persistenceRetryLimit: asPositiveInt(process.env.FLEET_PERSISTENCE_RETRY_LIMIT, 5),
    persistenceQueueMax: asPositiveInt(process.env.FLEET_PERSISTENCE_QUEUE_MAX, 10000),
    simulatorEnabled: asBoolean(process.env.SIMULATOR_ENABLED),
    simulatorVehicleCount: asPositiveInt(process.env.SIMULATOR_VEHICLE_COUNT, 3),
    simulatorUpdateIntervalMs: asPositiveInt(process.env.SIMULATOR_UPDATE_INTERVAL_MS, 3000),
    simulatorHeartbeatIntervalMs: asPositiveInt(process.env.SIMULATOR_HEARTBEAT_INTERVAL_MS, 10000),
    simulatorMode: (process.env.SIMULATOR_MODE || 'patrol').trim().toLowerCase(),
    simulatorStartLatitude: Number.isFinite(Number(process.env.SIMULATOR_START_LATITUDE)) ? Number(process.env.SIMULATOR_START_LATITUDE) : 12.9716,
    simulatorStartLongitude: Number.isFinite(Number(process.env.SIMULATOR_START_LONGITUDE)) ? Number(process.env.SIMULATOR_START_LONGITUDE) : 77.5946,
    simulatorMaxVehicles: asPositiveInt(process.env.SIMULATOR_MAX_VEHICLES, 25),
    simulatorAllowActiveAssignments: asBoolean(process.env.SIMULATOR_ALLOW_ACTIVE_ASSIGNMENTS),
    telemetryMaxAgeMs: asPositiveInt(process.env.FLEET_TELEMETRY_MAX_AGE_MS, 300000),
    telemetryFutureSkewMs: asPositiveInt(process.env.FLEET_TELEMETRY_FUTURE_SKEW_MS, 15000),
    telemetryDevices: JSON.parse(process.env.TELEMETRY_DEVICES_JSON || '{}'),
    crewBindings: JSON.parse(process.env.CREW_AMBULANCE_BINDINGS_JSON || '{}'),
    simulatorTelemetryKey: (process.env.SIMULATOR_TELEMETRY_KEY || '').trim(),
    dispatchRequireOnline: asBoolean(process.env.FLEET_DISPATCH_REQUIRE_ONLINE)
  }
};

if (env.nodeEnv === 'production') {
  for (const variable of ['JWT_SECRET', 'COOKIE_SECRET', 'DB_PASSWORD']) {
    if (!process.env[variable] || process.env[variable].length < (variable === 'DB_PASSWORD' ? 1 : 32)) {
      throw new Error(variable + ' must be configured securely in production.');
    }
  }
  if (env.corsOrigin === '*') throw new Error('Production CORS_ORIGIN must be explicit.');
}

export default env;
