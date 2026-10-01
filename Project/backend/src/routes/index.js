import { Router } from 'express';
import v1Routes from './v1/index.js';
import healthRoutes from '../modules/health/health.routes.js';

const router = Router();

// Root health check endpoint accessible at /api/health
router.use('/health', healthRoutes);

// Version 1 API routes accessible at /api/v1
router.use('/v1', v1Routes);

// Direct aliases for /api/* without /v1 prefix (e.g. /api/hospitals/nearby, /api/admin/hospitals/sync)
router.use('/', v1Routes);

export default router;
