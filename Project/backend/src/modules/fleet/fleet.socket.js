import { Server } from 'socket.io';
import sessionService from '../auth/session.service.js';
import User from '../users/user.model.js';
import env from '../../config/env.js';
import fleetTrackerService from './fleetTracker.service.js';
import fleetEventBus, { FLEET_EVENTS } from './fleet.events.js';

const FLEET_ROOM = 'fleet:dispatchers';
let socketServer;
let permissionTimer;
let broadcastTimer;
const pending = new Map();
const pendingHealth = new Map();
const listeners = [];

export async function authenticateSocket(socket) {
  const header = socket.handshake.headers?.authorization || '';
  const cookie = (socket.handshake.headers?.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(env.auth.cookieName + '='));
  const cookieToken = cookie ? decodeURIComponent(cookie.slice(env.auth.cookieName.length + 1)) : null;
  const token = socket.handshake.auth?.token || (header.startsWith('Bearer ') ? header.slice(7) : cookieToken);
  const verification = await sessionService.verifyActiveSessionToken(token);
  if (!verification.valid) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  const user = await User.findByPk(verification.payload.sub);
  if (!user || user.status !== 'ACTIVE' || !['ADMIN', 'DISPATCHER'].includes(user.role)) throw Object.assign(new Error('Fleet access denied.'), { status: 403 });
  socket.data.token = token;
  socket.data.user = { id: user.id, role: user.role };
}

function broadcast(name, payload) {
  for (const socket of socketServer?.sockets.sockets.values() || []) {
    if (!sessionService.verifySessionToken(socket.data.token).valid) socket.disconnect(true);
    else if (socket.rooms.has(FLEET_ROOM)) socket.emit(name, payload);
  }
}

async function emitSnapshot(socket) {
  if (socket.data.snapshotPending || Date.now() - (socket.data.lastSnapshotAt || 0) < 1000) return;
  socket.data.snapshotPending = true;
  try {
    await authenticateSocket(socket);
    const generatedAt = new Date().toISOString();
    const fleet = await fleetTrackerService.getSnapshot();
    if (!socket.connected) return;
    socket.emit('fleet:snapshot', { fleet, generated_at: generatedAt, redis_live: fleetTrackerService.store.isRedisReady() });
    socket.data.lastSnapshotAt = Date.now();
  } catch {
    if (!sessionService.verifySessionToken(socket.data.token).valid) { socket.disconnect(true); return; }
    clearTimeout(socket.data.snapshotRetry);
    socket.data.snapshotRetry = setTimeout(() => { if (socket.connected) emitSnapshot(socket); }, 2000);
    socket.emit('fleet:error', { code: 'SNAPSHOT_UNAVAILABLE', message: 'Fleet snapshot unavailable. Retry shortly.' });
  } finally { socket.data.snapshotPending = false; }
}

export function attachFleetSocketServer(httpServer) {
  socketServer = new Server(httpServer, { cors: { origin: env.corsOrigin, credentials: true }, maxHttpBufferSize: env.fleet.telemetryMaxPayloadBytes });
  socketServer.use((socket, next) => authenticateSocket(socket).then(() => next()).catch((failure) => {
    const error = new Error(failure.status === 401 || failure.status === 403 ? 'Fleet access denied.' : 'Fleet authentication temporarily unavailable.');
    error.data = { retryable: failure.status !== 401 && failure.status !== 403 };
    next(error);
  }));
  socketServer.on('connection', (socket) => {
    socket.join(FLEET_ROOM);
    emitSnapshot(socket);
    socket.on('fleet:resync', () => emitSnapshot(socket));
    socket.on('disconnect', () => clearTimeout(socket.data.snapshotRetry));
  });
  const queue = (state) => pending.set(Number(state.ambulance_id), state);
  const bindings = [
    [FLEET_EVENTS.UPDATED, ({ state }) => queue(state)],
    [FLEET_EVENTS.HEALTH_CHANGED, (state) => { queue(state); pendingHealth.set(Number(state.ambulance_id), state); }],
    [FLEET_EVENTS.PERSISTENCE_FAILURE, ({ message, retry_count }) => broadcast('fleet:persistence-warning', { message, retry_count })]
  ];
  for (const [event, callback] of bindings) { fleetEventBus.on(event, callback); listeners.push([event, callback]); }
  let redisLive = fleetTrackerService.store.isRedisReady();
  broadcastTimer = setInterval(() => {
    const ready = fleetTrackerService.store.isRedisReady();
    if (ready !== redisLive) {
      redisLive = ready;
      if (!ready) broadcast('fleet:error', { code: 'FLEET_STATE_UNAVAILABLE', message: 'Live fleet storage unavailable. Showing last known positions.' });
      else for (const socket of socketServer.sockets.sockets.values()) emitSnapshot(socket);
    }
    for (const state of pending.values()) broadcast('fleet:update', state);
    for (const state of pendingHealth.values()) broadcast('fleet:health', state);
    pending.clear();
    pendingHealth.clear();
  }, env.fleet.socketBroadcastIntervalMs);
  permissionTimer = setInterval(() => {
    for (const socket of socketServer?.sockets.sockets.values() || []) authenticateSocket(socket).catch((error) => {
      if (error.status === 401 || error.status === 403) socket.disconnect(true);
      else socket.conn.close(); // Transport close permits recovery after SQL/Redis returns.
    });
  }, 15000);
  return socketServer;
}

export async function closeFleetSocketServer() {
  clearInterval(permissionTimer);
  clearInterval(broadcastTimer);
  for (const [event, callback] of listeners.splice(0)) fleetEventBus.off(event, callback);
  pending.clear();
  pendingHealth.clear();
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  socketServer = null;
}

export default attachFleetSocketServer;
