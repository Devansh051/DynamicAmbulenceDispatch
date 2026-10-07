import { Sequelize } from 'sequelize';
import env from './env.js';
import logger from '../utils/logger.js';

/**
 * Sequelize SQL Server Database Connection
 * Configured strictly for non-destructive operations against the existing schema.
 */

export const sequelize = new Sequelize(
  env.db.database,
  env.db.user,
  env.db.password,
  {
    host: env.db.host,
    port: env.db.port,
    dialect: 'mssql',
    dialectOptions: {
      options: {
        instanceName: env.db.instanceName,
        encrypt: env.db.encrypt,
        trustServerCertificate: env.db.trustServerCertificate,
        connectTimeout: 15000,
        requestTimeout: 15000
      }
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: (msg) => {
      if (env.nodeEnv === 'development' && process.env.DEBUG_SQL === 'true') {
        logger.debug(msg);
      }
    },
    define: {
      timestamps: false, // Legacy schema does not use Sequelize default createdAt/updatedAt
      freezeTableName: true, // Prevents Sequelize from auto-pluralizing existing table names
      underscored: false
    }
  }
);

/**
 * Verifies SQL Server connectivity without modifying schema.
 * @returns {Promise<{ connected: boolean, latencyMs: number, error?: string }>}
 */
export const checkDatabaseHealth = async () => {
  const start = Date.now();
  try {
    await sequelize.authenticate();
    const latencyMs = Date.now() - start;
    return {
      connected: true,
      database: env.db.database,
      server: env.db.server,
      latencyMs
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      connected: false,
      database: env.db.database,
      server: env.db.server,
      latencyMs,
      error: error.message
    };
  }
};

export default sequelize;
