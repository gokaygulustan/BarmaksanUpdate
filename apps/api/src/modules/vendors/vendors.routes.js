import { Router } from 'express';
import * as vendorsController from './vendors.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'PURCHASING'), vendorsController.getAll);
router.get('/history', authorize('ADMIN', 'PURCHASING'), vendorsController.getPurchaseHistory);
router.get('/:id/history', authorize('ADMIN', 'PURCHASING'), vendorsController.getPurchaseHistory);
router.get('/:id', authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), vendorsController.getById);
router.post('/', authorize('ADMIN', 'PURCHASING'), vendorsController.create);
router.put('/:id', authorize('ADMIN', 'PURCHASING'), vendorsController.update);
router.delete('/:id', authorize('ADMIN'), vendorsController.remove);

export default router;
