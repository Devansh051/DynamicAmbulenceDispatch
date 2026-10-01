import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';

describe('Health API', () => {
  afterAll(async () => {
    // Close sequelize connection pool after tests run
    try {
      await sequelize.close();
    } catch (e) {
      // Ignore cleanup error
    }
  });

  test('GET /api/health returns health structure', async () => {
    const response = await request(app).get('/api/health');

    // Either 200 (healthy) or 503 (degraded if db unreachable)
    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty('success');
    expect(response.body.data).toHaveProperty('status');
    expect(response.body.data).toHaveProperty('service');
    expect(response.body.data).toHaveProperty('uptimeSeconds');
    expect(response.body.data).toHaveProperty('database');
    expect(response.body.meta).toHaveProperty('timestamp');
  });

  test('GET /api/v1/health returns health structure on versioned path', async () => {
    const response = await request(app).get('/api/v1/health');

    expect([200, 503]).toContain(response.status);
    expect(response.body.success).toBe(true);
    expect(response.body.data.service).toBe('EMS Dynamic Ambulance Dispatch API');
  });
});
