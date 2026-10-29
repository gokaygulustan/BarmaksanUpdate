import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

/**
 * Middleware to authenticate requests using JWT Bearer token.
 * Dynamically fetches current user's moduleId and subRole from database
 * to ensure database updates reflect immediately without requiring token re-issue.
 */
export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const liveUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        moduleId: true,
        subRole: true,
        isActive: true,
        isExecutive: true,
        phone: true,
      },
    });

    if (!liveUser || !liveUser.isActive) {
      return res.status(401).json({ message: 'Unauthorized: User not found or inactive.' });
    }

    // Depo Sorumlusu portal kullanıcısı değildir; unvanı sonradan değişse bile mevcut jeton geçersizdir.
    if (liveUser.subRole === 'WAREHOUSE') {
      return res.status(403).json({ message: 'Depo Sorumlusu hesapları portalı kullanamaz.' });
    }

    req.user = {
      id: liveUser.id,
      email: liveUser.email,
      name: liveUser.name,
      role: liveUser.role,
      moduleId: liveUser.moduleId || 'URETIM_PLANLAMA',
      subRole: liveUser.subRole || 'STAFF',
      isExecutive: Boolean(liveUser.isExecutive),
      phone: liveUser.phone || null,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Unauthorized: Token has expired.' });
    }
    return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
  }
};

/** Bearer varsa ve geçerliyse kullanıcıyı bağlar; yok/geçersizse public devam. */
export const optionalAuthenticate = async (req, _res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const liveUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        moduleId: true,
        subRole: true,
        isActive: true,
        isExecutive: true,
        phone: true,
      },
    });
    if (liveUser?.isActive && liveUser.subRole !== 'WAREHOUSE') {
      req.user = {
        id: liveUser.id,
        email: liveUser.email,
        name: liveUser.name,
        role: liveUser.role,
        moduleId: liveUser.moduleId || 'URETIM_PLANLAMA',
        subRole: liveUser.subRole || 'STAFF',
        isExecutive: Boolean(liveUser.isExecutive),
        phone: liveUser.phone || null,
      };
    }
  } catch {
    // public teklif sayfası; bozuk jeton yok sayılır
  }
  return next();
};
