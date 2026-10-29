import { Router } from 'express';
import * as notificationsController from './notifications.controller.js';
import { authenticate } from '../../middleware/authenticate.js';

const router = Router();

router.use(authenticate);

router.get('/', notificationsController.getForUser);
router.get('/list', notificationsController.listForUser);
router.patch('/read-all', notificationsController.markAllAsRead);
router.patch('/read-many', notificationsController.markManyAsRead);
router.post('/delete-many', notificationsController.removeMany);
router.patch('/:id/read', notificationsController.markAsRead);
router.patch('/:id/unread', notificationsController.markAsUnread);
router.delete('/:id', notificationsController.remove);

export default router;
