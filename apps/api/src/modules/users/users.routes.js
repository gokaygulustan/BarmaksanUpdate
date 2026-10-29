import { Router } from 'express';
import * as usersController from './users.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

/** Kullanıcı yönetimi: ADMIN veya üretim planlama PURCHASING (satın alma birimi değil). */
const authorizeUserAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized: Not authenticated.' });
  }
  const u = req.user;
  if (u.role === 'ADMIN') return next();
  if (u.role === 'PURCHASING' && u.moduleId === 'URETIM_PLANLAMA') return next();
  return res.status(403).json({ message: 'Forbidden: Kullanıcı yönetimine erişim yok.' });
};

router.use(authenticate);

router.get('/', authorizeUserAdmin, usersController.getAll);
router.get('/:id', authorizeUserAdmin, usersController.getById);
router.post('/', authorizeUserAdmin, usersController.create);
router.put('/:id', authorizeUserAdmin, usersController.update);
router.delete('/:id', authorizeUserAdmin, usersController.remove);

export default router;
