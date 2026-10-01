import { checkDatabaseHealth } from '../../config/database.js';
import { formatSuccess, formatError } from '../../utils/responseFormatter.js';
import Hospital from '../hospitals/hospital.model.js';
import Ambulance from '../ambulances/ambulance.model.js';
import Patient from '../patients/patient.model.js';
import env from '../../config/env.js';

const startTime = Date.now();

export const getHealth = async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();

    let counts = null;
    if (dbHealth.connected) {
      try {
        const [hospitalsCount, ambulancesCount, patientsCount] = await Promise.all([
          Hospital.count(),
          Ambulance.count(),
          Patient.count()
        ]);
        counts = {
          hospitals: hospitalsCount,
          ambulances: ambulancesCount,
          patients: patientsCount
        };
      } catch (countErr) {
        counts = { error: countErr.message };
      }
    }

    const isHealthy = dbHealth.connected;
    const statusCode = isHealthy ? 200 : 503;

    const data = {
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'EMS Dynamic Ambulance Dispatch API',
      version: '1.0.0',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      environment: env.nodeEnv,
      database: {
        ...dbHealth,
        counts
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
      }
    };

    return res.status(statusCode).json(formatSuccess(data));
  } catch (error) {
    return res.status(500).json(formatError(error.message, 'HEALTH_CHECK_FAILED'));
  }
};

export default { getHealth };
