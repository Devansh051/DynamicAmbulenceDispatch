import request from 'supertest';
import app from '../src/app.js';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import UserAuthIdentity from '../src/modules/users/userIdentity.model.js';
import { setMockGoogleVerifier } from '../src/modules/auth/google-auth.service.js';
import env from '../src/config/env.js';
import bcrypt from 'bcrypt';

describe('Google Authentication & Account Linking API', () => {
  let localUser;
  let linkedGoogleUser;
  let googleOnlyUser;
  let localUserToken;

  const mockGooglePayloads = {
    'valid-token-linked': {
      sub: 'google-sub-linked-12345',
      email: 'linked_user@ems.local',
      email_verified: true,
      name: 'Linked Google User',
      picture: 'https://lh3.googleusercontent.com/photo.jpg'
    },
    'valid-token-unlinked-local-match': {
      sub: 'google-sub-new-unlinked-999',
      email: 'local_match@ems.local',
      email_verified: true,
      name: 'Local Match User',
      picture: null
    },
    'valid-token-unverified-email': {
      sub: 'google-sub-unverified-777',
      email: 'unverified@ems.local',
      email_verified: false,
      name: 'Unverified Google User',
      picture: null
    },
    'valid-token-brand-new': {
      sub: 'google-sub-brand-new-555',
      email: 'brand_new_google@ems.local',
      email_verified: true,
      name: 'Brand New User',
      picture: null
    },
    'valid-token-for-linking': {
      sub: 'google-sub-to-link-444',
      email: 'local_match@ems.local',
      email_verified: true,
      name: 'Local Match User',
      picture: null
    },
    'valid-token-google-only': {
      sub: 'google-sub-only-888',
      email: 'google_only@ems.local',
      email_verified: true,
      name: 'Google Only User',
      picture: null
    }
  };

  beforeAll(async () => {
    // Inject mock Google token verifier
    setMockGoogleVerifier(async (token) => {
      if (token in mockGooglePayloads) {
        return mockGooglePayloads[token];
      }
      throw new Error('Invalid or unknown mock Google ID token');
    });

    // Cleanup test users
    await User.destroy({
      where: {
        email: [
          'linked_user@ems.local',
          'local_match@ems.local',
          'unverified@ems.local',
          'brand_new_google@ems.local',
          'google_only@ems.local'
        ]
      }
    });

    const hash = await bcrypt.hash('SecurePass123!', 10);

    // 1. Linked Google User
    linkedGoogleUser = await User.create({
      email: 'linked_user@ems.local',
      name: 'Linked Google User',
      password_hash: hash,
      role: USER_ROLES.HOSPITAL_OPERATOR,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    await UserAuthIdentity.create({
      user_id: linkedGoogleUser.id,
      provider: 'google',
      provider_subject: 'google-sub-linked-12345',
      provider_email: 'linked_user@ems.local',
      provider_email_verified: true
    });

    // 2. Local-only User with matching email
    localUser = await User.create({
      email: 'local_match@ems.local',
      name: 'Local Match User',
      password_hash: hash,
      role: USER_ROLES.DISPATCHER,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    // 3. Google-only User (no password_hash)
    googleOnlyUser = await User.create({
      email: 'google_only@ems.local',
      name: 'Google Only User',
      password_hash: null,
      role: USER_ROLES.AMBULANCE_CREW,
      status: USER_STATUS.ACTIVE,
      email_verified: true,
      must_change_password: false
    });

    await UserAuthIdentity.create({
      user_id: googleOnlyUser.id,
      provider: 'google',
      provider_subject: 'google-sub-only-888',
      provider_email: 'google_only@ems.local',
      provider_email_verified: true
    });

    // Login local user to obtain Bearer token for linking tests
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'local_match@ems.local', password: 'SecurePass123!' });
    localUserToken = loginRes.body.data.token;
  });

  afterAll(async () => {
    // Reset mock verifier
    setMockGoogleVerifier(null);

    await User.destroy({
      where: {
        email: [
          'linked_user@ems.local',
          'local_match@ems.local',
          'unverified@ems.local',
          'brand_new_google@ems.local',
          'google_only@ems.local'
        ]
      }
    });

    try {
      await sequelize.close();
    } catch (e) {}
  });

  test('POST /api/v1/auth/google - rejects missing or invalid credential', async () => {
    const resEmpty = await request(app).post('/api/v1/auth/google').send({});
    expect(resEmpty.status).toBe(400);

    const resInvalid = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'totally-fake-token' });
    expect(resInvalid.status).toBe(400);
  });

  test('POST /api/v1/auth/google - rejects Google token with unverified email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'valid-token-unverified-email' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
  });

  test('POST /api/v1/auth/google - Case A: logs in existing linked account and retains operational role', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'valid-token-linked' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe('linked_user@ems.local');
    expect(res.body.data.user.role).toBe(USER_ROLES.HOSPITAL_OPERATOR); // Role preserved
  });

  test('POST /api/v1/auth/google - Case B: prevents silent auto-linking when local account has matching email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'valid-token-unlinked-local-match' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS_LINK_REQUIRED');
  });

  test('POST /api/v1/auth/google - Case C: rejects unregistered Google identities when public signup is disabled', async () => {
    env.auth.googleSignupMode = 'disabled';

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'valid-token-brand-new' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SIGNUP_DISABLED');
  });

  test('POST /api/v1/auth/google - Case C: creates restricted PENDING account when signupMode is pending', async () => {
    env.auth.googleSignupMode = 'pending';

    const res = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'valid-token-brand-new' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_PENDING_APPROVAL');

    // Verify user was created in PENDING status with non-privileged role
    const createdUser = await User.findOne({ where: { email: 'brand_new_google@ems.local' } });
    expect(createdUser).not.toBeNull();
    expect(createdUser.status).toBe(USER_STATUS.PENDING);
    expect(createdUser.role).not.toBe(USER_ROLES.ADMIN);

    // Reset back to disabled
    env.auth.googleSignupMode = 'disabled';
  });

  test('POST /api/v1/auth/google/link - links Google account to authenticated user session', async () => {
    const res = await request(app)
      .post('/api/v1/auth/google/link')
      .set('Authorization', `Bearer ${localUserToken}`)
      .send({ credential: 'valid-token-for-linking' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.linked_providers.some(p => p.provider === 'google')).toBe(true);
  });

  test('POST /api/v1/auth/google/link - prevents linking Google identity already belonging to another account', async () => {
    // Attempt to link 'valid-token-linked' which belongs to linkedGoogleUser
    const res = await request(app)
      .post('/api/v1/auth/google/link')
      .set('Authorization', `Bearer ${localUserToken}`)
      .send({ credential: 'valid-token-linked' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IDENTITY_ALREADY_LINKED');
  });

  test('DELETE /api/v1/auth/google/link - allows unlinking when user has a local password', async () => {
    const res = await request(app)
      .delete('/api/v1/auth/google/link')
      .set('Authorization', `Bearer ${localUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('DELETE /api/v1/auth/google/link - prevents unlinking if Google is the only authentication method', async () => {
    // Login as google-only user
    const resLogin = await request(app)
      .post('/api/v1/auth/google')
      .send({ credential: 'valid-token-google-only' });
    expect(resLogin.status).toBe(200);
    const googleOnlyToken = resLogin.body.data.token;

    // Attempt to unlink Google
    const resUnlink = await request(app)
      .delete('/api/v1/auth/google/link')
      .set('Authorization', `Bearer ${googleOnlyToken}`);

    expect(resUnlink.status).toBe(400);
    expect(resUnlink.body.error.code).toBe('CANNOT_UNLINK_ONLY_AUTH_METHOD');
  });
});
