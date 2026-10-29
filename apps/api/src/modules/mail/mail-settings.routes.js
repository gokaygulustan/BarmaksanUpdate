import { Router } from 'express';
import * as mailSettingsController from './mail-settings.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeExecutive } from '../../lib/access.js';

const router = Router();

router.use(authenticate);
router.use(authorizeExecutive);

router.get('/', mailSettingsController.get);
router.put('/', mailSettingsController.update);
router.post('/test', mailSettingsController.test);

export default router;
