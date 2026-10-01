import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import bcrypt from 'bcrypt';

describe('Authentication API (Email / Password & Session)', () => {
  let activeUser;
  let pendingUser;
  let inactiveUser;
  let userToken;

  beforeAll(async () => {
    // Clean up any test users from prior runs
    await User.destroy({
      where: {
        email: [
          'test_active@ems.local',
          'test_pending@ems.local',
          'test_inactive@ems.local',
          'test_temp@ems.local'
        ]
      }
    });

    const hash = await bcrypt.hash('SecretPass123!', 10);

    activeUser = await User.create({
      email: 'test_active@ems.local',
      name: 'Active Test User',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    pendingUser = await User.create({
      email: 'test_pending@ems.local',
      name: 'Pending Test User',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.PENDING,
      email_verified: true,
      must_change_password: false
    });

    inactiveUser = await User.create({
      email: 'test_inactive@ems.local',
      name: 'Inactive Test User',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.INACTIVE,
      email_verified: true,
      must_change_password: false
    });
  });

  afterAll(async () => {
    await User.destroy({
      where: {
        email: [
          'test_active@ems.local',
          'test_pending@ems.local',
          'test_inactive@ems.local',
          'test_temp@ems.local'
        ]
      }
    });
    try {
      await sequelize.close();
    } catch (e) {}
  });

  test('POST /api/v1/auth/login - returns 400 for missing credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/v1/auth/login - returns 401 for unknown user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nonexistent@ems.local', password: 'AnyPassword123!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /api/v1/auth/login - returns 401 for incorrect password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test_active@ems.local', password: 'WrongPassword999!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('POST /api/v1/auth/login - returns 403 for PENDING user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test_pending@ems.local', password: 'SecretPass123!' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');
  });

  test('POST /api/v1/auth/login - returns 403 for INACTIVE user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test_inactive@ems.local', password: 'SecretPass123!' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  test('POST /api/v1/auth/login - successfully authenticates active user & never exposes password hash', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test_active@ems.local', password: 'SecretPass123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe('test_active@ems.local');
    expect(res.body.data.user.role).toBe(USER_ROLES.DISPATCHER);
    expect(res.body.data.user.status).toBe(USER_STATUS.ACTIVE);
    expect(res.body.data.user.password_hash).toBeUndefined(); // Crucial: never expose password_hash
    expect(res.body.data.user.password).toBeUndefined();

    userToken = res.body.data.token;
  });

  test('GET /api/v1/auth/me - returns authenticated user profile with valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('test_active@ems.local');
    expect(res.body.data.password_hash).toBeUndefined();
  });

  test('GET /api/v1/auth/me - rejects request with missing or invalid token', async () => {
    const resNoToken = await request(app).get('/api/v1/auth/me');
    expect(resNoToken.status).toBe(401);

    const resBadToken = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid.token.payload');
    expect(resBadToken.status).toBe(401);
  });

  test('POST /api/v1/auth/change-password - changes password successfully', async () => {
    const resBadCurrent = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ currentPassword: 'WrongPassword!', newPassword: 'BrandNewPass123!' });

    expect(resBadCurrent.status).toBe(400);
    expect(resBadCurrent.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    const resSuccess = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ currentPassword: 'SecretPass123!', newPassword: 'BrandNewPass123!' });

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.success).toBe(true);

    // Verify new password works
    const resNewLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test_active@ems.local', password: 'BrandNewPass123!' });

    expect(resNewLogin.status).toBe(200);
    userToken = resNewLogin.body.data.token;
  });

  test('POST /api/v1/auth/logout - invalidates session token', async () => {
    const resLogout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${userToken}`);

    expect(resLogout.status).toBe(200);
    expect(resLogout.body.success).toBe(true);

    // Now attempting to access /auth/me with revoked token should fail with 401
    const resAfter = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    expect(resAfter.status).toBe(401);
  });
});
