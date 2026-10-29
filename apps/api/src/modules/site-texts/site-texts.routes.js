import { Router } from 'express';
import { z } from 'zod';
import * as service from './site-texts.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const router = Router();

const keySchema = z.string().trim().min(1).max(500);
const saveSchema = z.object({ value: z.string().max(4000).nullable() });

// Okuma bütün giriş yapmışlara açık (ekranda görünen yazı); değiştirmek yalnızca ADMIN.
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(await service.getAll());
  } catch (e) {
    next(e);
  }
});

router.put('/:key', authorize('ADMIN'), async (req, res, next) => {
  try {
    const key = keySchema.parse(req.params.key);
    const { value } = saveSchema.parse(req.body);
    res.json(await service.save(key, value, req.user.name || req.user.email || null));
  } catch (e) {
    next(e);
  }
});

router.get('/:key/history', authorize('ADMIN'), async (req, res, next) => {
  try {
    res.json(await service.history(keySchema.parse(req.params.key)));
  } catch (e) {
    next(e);
  }
});

export default router;
