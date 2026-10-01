import request from 'supertest';
import app from '../src/app.js';

describe('Error Handling Middleware', () => {
  test('returns standardized 404 for non-existent routes', async () => {
    const response = await request(app).get('/api/unknown-endpoint-xyz');

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.timestamp).toBeDefined();
  });
});
