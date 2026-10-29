import { Router } from 'express';
import * as productsController from './products.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Everyone authenticated can view products and by id
router.get('/', authenticate, productsController.getAll);
router.get('/:id', authenticate, productsController.getById);

// Admins, Purchasing or Supplier (for their own items ideally, but for MVP we simplify role check)
router.post('/', authenticate, authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), productsController.create);
router.put('/:id', authenticate, authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), productsController.update);
router.delete('/:id', authenticate, authorize('ADMIN', 'PURCHASING', 'SUPPLIER'), productsController.remove);

export default router;
