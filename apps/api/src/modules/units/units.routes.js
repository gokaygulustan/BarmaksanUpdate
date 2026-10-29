import { Router } from 'express';
import * as controller from './units.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

// Tüm giriş yapmış kullanıcılar birimleri görebilir
router.use(authenticate);

router.get('/', controller.getAll);
router.post('/', authorize('ADMIN', 'PURCHASING'), controller.create);
router.post('/resolve', authorize('ADMIN', 'PURCHASING', 'DEPARTMENT'), controller.resolve);
router.post('/resolve-many', authorize('ADMIN', 'PURCHASING', 'DEPARTMENT'), controller.resolveMany);
router.delete('/:id', authorize('ADMIN'), controller.remove);

export default router;
