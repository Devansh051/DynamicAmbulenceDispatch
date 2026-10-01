import bcrypt from 'bcrypt';
import sequelize from '../src/config/database.js';
import User, { USER_ROLES, USER_STATUS } from '../src/modules/users/user.model.js';
import { recordAuditEvent, AUDIT_EVENTS } from '../src/modules/audit/audit.service.js';
import env from '../src/config/env.js';
import logger from '../src/utils/logger.js';

async function bootstrapAdmin() {
  try {
    logger.info('Initializing administrator bootstrap check...');
    await sequelize.authenticate();

    // Check if an active administrator already exists
    const existingAdmin = await User.findOne({
      where: {
        role: USER_ROLES.ADMIN,
        status: USER_STATUS.ACTIVE
      }
    });

    if (existingAdmin) {
      console.log(`⚠️ An active administrator account already exists (${existingAdmin.email}). Bootstrap aborted to prevent overwriting.`);
      await sequelize.close();
      process.exit(0);
    }

    const email = (process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
    const name = (process.env.ADMIN_NAME || process.argv[3] || 'System Administrator').trim();
    const password = process.env.ADMIN_PASSWORD || process.argv[4];

    if (!email || !email.includes('@')) {
      console.error('❌ Error: A valid ADMIN_EMAIL must be provided via environment variable or CLI argument.');
      console.log('Usage: node backend/scripts/bootstrapAdmin.js <email> <name> <password>');
      console.log('Or set env vars: ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD');
      await sequelize.close();
      process.exit(1);
    }

    if (!password || password.length < 8) {
      console.error('❌ Error: ADMIN_PASSWORD must be at least 8 characters in length.');
      await sequelize.close();
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, env.auth.bcryptRounds || 10);

    // Check if a user with this email already exists but with a different role
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      existingUser.role = USER_ROLES.ADMIN;
      existingUser.status = USER_STATUS.ACTIVE;
      existingUser.password_hash = passwordHash;
      existingUser.must_change_password = false;
      existingUser.email_verified = true;
      existingUser.updated_at = new Date();
      await existingUser.save();
      console.log(`✅ Existing user '${email}' elevated to primary ADMIN.`);
    } else {
      const newAdmin = await User.create({
        email,
        name,
        password_hash: passwordHash,
        role: USER_ROLES.ADMIN,
        status: USER_STATUS.ACTIVE,
        email_verified: true,
        must_change_password: false,
        created_at: new Date(),
        updated_at: new Date()
      });
      await recordAuditEvent({
        userId: newAdmin.id,
        eventType: AUDIT_EVENTS.USER_PROVISIONED,
        details: { action: 'BOOTSTRAP_ADMIN', email }
      });
      console.log(`✅ Initial administrator created successfully: ${email} (${name}).`);
    }

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Administrator bootstrap failed:', error.message);
    await sequelize.close().catch(() => {});
    process.exit(1);
  }
}

bootstrapAdmin();
