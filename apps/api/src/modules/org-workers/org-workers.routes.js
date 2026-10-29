import { Router } from 'express';
import * as controller from './org-workers.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN', 'PURCHASING'));

router.get('/', controller.list);
router.post('/', authorize('ADMIN', 'PURCHASING'), controller.create);
router.put('/:id', authorize('ADMIN'), controller.update);
router.delete('/:id', authorize('ADMIN'), controller.remove);

export default router;
