import { Router } from 'express';
import * as mailOutboxController from './mail-outbox.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

const authorizeAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized: Not authenticated.' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Forbidden: Bu işlem yalnızca sistem yöneticisi içindir.' });
  }
  next();
};

router.use(authenticate);
router.use(authorizeAdmin);

router.get('/', mailOutboxController.list);
router.post('/seed-previews', mailOutboxController.seedPreviews);
router.post('/clear-previews', mailOutboxController.clearPreviews);
router.post('/delete-many', mailOutboxController.removeMany);
router.get('/:id', mailOutboxController.getById);
router.delete('/:id', mailOutboxController.remove);

export default router;
