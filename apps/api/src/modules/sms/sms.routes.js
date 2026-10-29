import { Router } from 'express';
import * as smsController from './sms.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeExecutive } from '../../lib/access.js';

const router = Router();
router.use(authenticate);
router.use(authorizeExecutive);
router.get('/', smsController.get);
router.put('/', smsController.update);
router.post('/test', smsController.test);
export default router;
