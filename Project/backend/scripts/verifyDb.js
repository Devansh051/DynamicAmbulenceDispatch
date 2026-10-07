import sequelize, { checkDatabaseHealth } from '../src/config/database.js';
try {
  const health = await checkDatabaseHealth();
  console.log(JSON.stringify(health));
  if (!health.connected) process.exitCode = 1;
} finally { await sequelize.close(); }
