import crypto from 'crypto';
import sequelize from '../../config/database.js';

export const operationalStatusForIncident = (status) => ({
  DISPATCHED: 'ASSIGNED', EN_ROUTE: 'EN_ROUTE_TO_SCENE', AT_PATIENT: 'ARRIVED_AT_SCENE',
  TRANSPORTING: 'TRANSPORTING', AT_HOSPITAL: 'ARRIVED_AT_HOSPITAL',
  RESOLVED: 'AVAILABLE', CLOSED: 'AVAILABLE', CANCELLED: 'AVAILABLE'
}[status]);

export async function recordFleetDispatchChange(incident, options) {
  if (!incident.changed('status') && !incident.changed('assigned_ambulance_id')) return;
  const status = operationalStatusForIncident(incident.status);
  if (!status) return;
  const previousId = incident.previous('assigned_ambulance_id');
  const previousStatus = operationalStatusForIncident(incident.previous('status'));
  const operations = [];
  if (previousId && Number(previousId) !== Number(incident.assigned_ambulance_id)) {
    operations.push({ ambulanceId: previousId, status: 'AVAILABLE', assignmentId: null });
  }
  if (incident.assigned_ambulance_id && !(status === 'AVAILABLE' && previousStatus === 'AVAILABLE')) {
    operations.push({ ambulanceId: incident.assigned_ambulance_id, status, assignmentId: status === 'AVAILABLE' ? null : incident.id });
  }
  for (const operation of operations) {
    await recordAmbulanceOperationalChange({ ...operation,
      previousStatus: Number(operation.ambulanceId) === Number(previousId) ? previousStatus : 'AVAILABLE',
      simulated: incident.is_simulated }, options.transaction);
  }
}

export async function recordAmbulanceOperationalChange({ ambulanceId, status, assignmentId = null, previousStatus = null, simulated = false, sourceId = 'dispatch' }, transaction) {
  const eventId = crypto.randomUUID();
  await sequelize.query(`INSERT INTO dbo.FleetDispatchOutbox
    (event_id, ambulance_id, operational_status, assignment_id, is_simulated)
    VALUES (:eventId, :ambulanceId, :status, :assignmentId, :simulated);
    INSERT INTO dbo.AmbulanceOperationalEvents
    (event_id, ambulance_id, from_status, to_status, assignment_id, gps_event_timestamp, server_received_at, is_simulated, source_id)
    VALUES (:eventId, :ambulanceId, :previousStatus, :status, :assignmentId, SYSUTCDATETIME(), SYSUTCDATETIME(), :simulated, :sourceId);`,
  { replacements: { eventId, ambulanceId, status, assignmentId, previousStatus: previousStatus || null, simulated: simulated ? 1 : 0, sourceId }, transaction });
}

export async function drainDispatchOutbox(tracker) {
  const [rows] = await sequelize.query('SELECT TOP (100) * FROM dbo.FleetDispatchOutbox WHERE delivered_at IS NULL ORDER BY id');
  for (const row of rows) {
    await tracker.syncOperationalState({ ambulanceId: row.ambulance_id, operationalStatus: row.operational_status,
      assignmentId: row.assignment_id, operationVersion: Number(row.id), eventId: row.event_id });
    await sequelize.query('UPDATE dbo.FleetDispatchOutbox SET delivered_at = SYSUTCDATETIME() WHERE id = :id', { replacements: { id: row.id } });
  }
  return rows.length;
}
