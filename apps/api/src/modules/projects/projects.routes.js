import { Router } from 'express';
import * as controller from './projects.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN', 'PURCHASING'));

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/requests', controller.moveRequests);

export default router;
