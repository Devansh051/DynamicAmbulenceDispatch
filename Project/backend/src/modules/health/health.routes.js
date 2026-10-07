import { Router } from 'express';
import { getHealth } from './health.controller.js';
import authenticate from '../../middleware/authenticate.js';
import authorize from '../../middleware/authorize.js';
import requireActiveAccount from '../../middleware/requireActiveAccount.js';

const router = Router();

router.get('/', getHealth);
router.get('/details', authenticate, requireActiveAccount, authorize('ADMIN', 'DISPATCHER'), getHealth);

export default router;
