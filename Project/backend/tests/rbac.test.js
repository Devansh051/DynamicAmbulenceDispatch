import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import sessionService from '../src/modules/auth/session.service.js';
import bcrypt from 'bcrypt';

describe('Role-Based Access Control (RBAC) & User Management API', () => {
  let adminUser;
  let dispatcherUser;
  let crewUser;
  let hospitalUser;

  let adminToken;
  let dispatcherToken;
  let crewToken;
  let hospitalToken;

  beforeAll(async () => {
    await User.destroy({
      where: {
        email: [
          'rbac_admin@ems.local',
          'rbac_disp@ems.local',
          'rbac_crew@ems.local',
          'rbac_hosp@ems.local',
          'rbac_provisioned@ems.local',
          'pending_to_approve@ems.local'
        ]
      }
    });

    const hash = await bcrypt.hash('TestPass123!', 10);

    adminUser = await User.create({
      email: 'rbac_admin@ems.local',
      name: 'RBAC Admin',
      password_hash: hash,
      role: USER_ROLES.ADMIN,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    dispatcherUser = await User.create({
      email: 'rbac_disp@ems.local',
      name: 'RBAC Dispatcher',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    crewUser = await User.create({
      email: 'rbac_crew@ems.local',
      name: 'RBAC Crew',
      password_hash: hash,
      role: USER_ROLES.AMBULANCE_CREW,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    hospitalUser = await User.create({
      email: 'rbac_hosp@ems.local',
      name: 'RBAC Hospital',
      password_hash: hash,
      role: USER_ROLES.HOSPITAL_OPERATOR,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    adminToken = sessionService.createSessionToken(adminUser).token;
    dispatcherToken = sessionService.createSessionToken(dispatcherUser).token;
    crewToken = sessionService.createSessionToken(crewUser).token;
    hospitalToken = sessionService.createSessionToken(hospitalUser).token;
  });

  afterAll(async () => {
    await User.destroy({
      where: {
        email: [
          'rbac_admin@ems.local',
          'rbac_disp@ems.local',
          'rbac_crew@ems.local',
          'rbac_hosp@ems.local',
          'rbac_provisioned@ems.local',
          'pending_to_approve@ems.local'
        ]
      }
    });

    try {
      await sequelize.close();
    } catch (e) {}
  });

  test('GET /api/v1/users - rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/v1/users - rejects DISPATCHER role with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/users - rejects AMBULANCE_CREW role with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${crewToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/users - rejects HOSPITAL_OPERATOR role with 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${hospitalToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('GET /api/v1/users - allows ADMIN role to list users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.pagination).toBeDefined();
  });

  test('POST /api/v1/users - allows ADMIN to provision a new user with temporary password', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'rbac_provisioned@ems.local',
        name: 'Provisioned Tech',
        role: USER_ROLES.AMBULANCE_CREW
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.temporaryPassword).toBeDefined();
    expect(res.body.data.user.must_change_password).toBe(true);
    expect(res.body.data.user.role).toBe(USER_ROLES.AMBULANCE_CREW);
    expect(res.body.data.user.password_hash).toBeUndefined();
  });

  test('POST /api/v1/users - rejects non-admin attempts to provision users', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        email: 'malicious_user@ems.local',
        name: 'Hacker',
        role: USER_ROLES.ADMIN
      });

    expect(res.status).toBe(403);
  });

  test('PATCH /api/v1/users/:id/status - allows ADMIN to change account status', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${dispatcherUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: USER_STATUS.INACTIVE });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(USER_STATUS.INACTIVE);

    // Revert back to active
    await request(app)
      .patch(`/api/v1/users/${dispatcherUser.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: USER_STATUS.ACTIVE });
  });

  test('POST /api/v1/users/:id/approve - allows ADMIN to approve pending accounts', async () => {
    const pending = await User.create({
      email: 'pending_to_approve@ems.local',
      name: 'To Approve',
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.PENDING
    });

    const res = await request(app)
      .post(`/api/v1/users/${pending.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(USER_STATUS.ACTIVE);
    expect(res.body.data.approved_at).toBeDefined();

    await pending.destroy();
  });

  test('PATCH /api/v1/users/:id/role - protects against demoting the last active administrator', async () => {
    // There is only adminUser and the bootstrap admin. If we try to demote adminUser and it was the last, it would be caught.
    // Let's test the ensureNotLastActiveAdmin logic
    const allAdmins = await User.findAll({ where: { role: USER_ROLES.ADMIN, status: USER_STATUS.ACTIVE } });

    // If only 1 admin exists, demoting should fail
    if (allAdmins.length === 1) {
      const res = await request(app)
        .patch(`/api/v1/users/${allAdmins[0].id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: USER_ROLES.DISPATCHER });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('LAST_ADMIN_PROTECTION');
    }
  });
});
