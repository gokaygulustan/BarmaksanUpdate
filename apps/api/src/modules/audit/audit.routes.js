import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeExecutive } from '../../lib/access.js';
import { prisma } from '../../lib/prisma.js';

const router = Router();
router.use(authenticate);
router.use(authorizeExecutive);

router.get('/', async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.take) || 100, 200);
    const severity = req.query.severity === 'ALERT' ? 'ALERT' : undefined;
    const rows = await prisma.auditEvent.findMany({
      where: severity ? { severity } : {},
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        actorUser: { select: { id: true, name: true, email: true } },
      },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
