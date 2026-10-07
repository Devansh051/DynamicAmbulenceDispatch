import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import env from './config/env.js';
import requestLogger from './middleware/requestLogger.js';
import notFoundHandler from './middleware/notFoundHandler.js';
import errorHandler from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

const app = express();

// Security and CORS
app.use(cors({
  origin: env.corsOrigin === '*' ? true : [env.corsOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Cookie Parser
app.use(cookieParser(env.auth.cookieSecret));

// Parsers with size limits
app.use(['/api/v1/fleet/telemetry', '/api/v1/fleet/heartbeat'], express.json({ limit: env.fleet.telemetryMaxPayloadBytes }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Structured Request Logging
app.use(requestLogger);

// Mount API routes
app.use('/api', apiRoutes);

// 404 Handler for undefined routes
app.use(notFoundHandler);

// Centralized Error Handler
app.use(errorHandler);

export default app;
