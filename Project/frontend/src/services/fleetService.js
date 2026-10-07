import { io } from 'socket.io-client';
import api, { getAuthToken } from './api';

const socketUrl = () => {
  const configured = (import.meta.env.VITE_SOCKET_URL || '').trim();
  if (configured) return configured;
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
  return baseUrl.replace(/\/api\/v1\/?$/, '');
};

export const fleetService = {
  async getSnapshot() {
    const response = await api.get('/fleet/snapshot');
    return response.data;
  },

  connect({ onConnect, onDisconnect, onSnapshot, onUpdate, onHealth, onError }) {
    const socket = io(socketUrl(), {
      auth: (callback) => callback({ token: getAuthToken() }),
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 5000
    });
    let retryTimer;
    let stopped = false;
    const disconnect = socket.disconnect.bind(socket);
    socket.disconnect = () => { stopped = true; clearTimeout(retryTimer); return disconnect(); };
    socket.on('connect', () => {
      clearTimeout(retryTimer);
      onConnect?.();
      socket.emit('fleet:resync');
    });
    socket.on('disconnect', (reason) => onDisconnect?.(reason));
    socket.on('connect_error', (error) => {
      onError?.(error);
      // Socket.IO does not retry middleware rejection automatically.
      // Retry only explicitly temporary failures; rejected credentials stop.
      if (error.data?.retryable && !stopped) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (!stopped) socket.connect(); }, 5000);
      }
    });
    socket.on('fleet:snapshot', onSnapshot);
    socket.on('fleet:update', onUpdate);
    socket.on('fleet:health', onHealth);
    socket.on('fleet:error', onError);
    socket.on('fleet:persistence-warning', (warning) => onError?.({ message: warning.message, persistenceOnly: true }));
    return socket;
  }
};

export default fleetService;
