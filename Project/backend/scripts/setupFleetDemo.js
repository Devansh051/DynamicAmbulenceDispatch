import bcrypt from 'bcrypt';
import env from '../src/config/env.js';
import sequelize from '../src/config/database.js';
import User from '../src/modules/users/user.model.js';
import Hospital from '../src/modules/hospitals/hospital.model.js';
import Ambulance from '../src/modules/ambulances/ambulance.model.js';

async function prepare() {
  if (env.nodeEnv === 'production' || !/^[A-Za-z][A-Za-z0-9_]*_Test$/.test(env.db.database)) {
    throw new Error('Demo setup requires a non-production database ending in _Test.');
  }
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!password || password.length < 12) throw new Error('Set DEMO_ADMIN_PASSWORD to at least 12 characters; it is never printed.');
  const email = process.env.DEMO_ADMIN_EMAIL || 'fleet-demo@ems.test';
  if (!/^[A-Za-z0-9._+-]+@ems\.test$/.test(email)) throw new Error('Demo email must use the synthetic ems.test domain.');
  const transaction = await sequelize.transaction();
  try {
    const [user] = await User.findOrCreate({ where: { email }, defaults: { name: 'Synthetic Fleet Demo', role: 'ADMIN', status: 'ACTIVE',
      password_hash: await bcrypt.hash(password, 10), must_change_password: false, email_verified: true }, transaction });
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE' || !await bcrypt.compare(password, user.password_hash || '')) {
      throw new Error('The demo account already exists with different credentials or permissions; it was not changed.');
    }
    const [hospital] = await Hospital.findOrCreate({ where: { HospitalName: 'Synthetic Fleet Demo Base' }, defaults: {
      Location: 'Synthetic demonstration only', latitude: 12.97, longitude: 77.59, is_active: true, emergency_services: true }, transaction });
    const ids = [];
    for (let index = 1; index <= 3; index += 1) {
      const [ambulance] = await Ambulance.findOrCreate({ where: { fleet_code: 'SIM-DEMO-' + index }, defaults: {
        registration_number: 'SIM-DEMO-' + index, CurrentHospitalID: hospital.HospitalID, Status: 'available', Fuel: 100,
        vehicle_type: 'ADVANCED_LIFE_SUPPORT', is_active: true, is_simulated: true,
        current_location_lat: 12.97 + index * 0.001, current_location_lng: 77.59 }, transaction });
      if (!ambulance.is_simulated || !ambulance.is_active) throw new Error('A demo fleet code is occupied by a non-simulated/inactive record; no records changed.');
      ids.push(ambulance.AmbulanceID);
    }
    await transaction.commit();
    console.log(JSON.stringify({ database: env.db.database, email, hospital_id: hospital.HospitalID, ambulance_ids: ids }));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }
}

try { await prepare(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await sequelize.close(); }
