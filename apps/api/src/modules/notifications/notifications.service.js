import { prisma } from '../../lib/prisma.js';

export const getForUser = async (userId) => {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
};

const noteKind = (kind) => (kind === 'MESSAGE' || kind === 'ALERT' ? kind : null);

/** Tüm bildirimler tablosu: sayfalı, tür / okunma / metin filtresi. */
export const listForUser = async (userId, { page, pageSize, kind, status, q } = {}) => {
  const take = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const current = Math.max(parseInt(page, 10) || 1, 1);
  const where = { userId };
  const scoped = noteKind(kind);
  if (scoped) where.kind = scoped;
  if (status === 'unread') where.isRead = false;
  if (status === 'read') where.isRead = true;
  const text = String(q || '').trim();
  if (text) where.message = { contains: text.slice(0, 200), mode: 'insensitive' };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (current - 1) * take,
      take,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);
  return { items, total, page: current, pageSize: take, unreadCount };
};

export const markAsRead = async (id, userId) => {
  return prisma.notification.update({
    where: { id, userId },
    data: { isRead: true },
  });
};

export const markAsUnread = async (id, userId) => {
  return prisma.notification.update({
    where: { id, userId },
    data: { isRead: false },
  });
};

const ownIds = (ids) =>
  (Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter(Boolean).slice(0, 500);

export const markManyAsRead = async (userId, ids, isRead = true) => {
  const list = ownIds(ids);
  if (!list.length) return { count: 0 };
  return prisma.notification.updateMany({
    where: { userId, id: { in: list } },
    data: { isRead: Boolean(isRead) },
  });
};

export const remove = async (id, userId) => {
  return prisma.notification.deleteMany({ where: { id, userId } });
};

export const removeMany = async (userId, ids) => {
  const list = ownIds(ids);
  if (!list.length) return { count: 0 };
  return prisma.notification.deleteMany({ where: { userId, id: { in: list } } });
};

export const markAllAsRead = async (userId, kind) => {
  const where = { userId, isRead: false };
  const scoped = noteKind(kind);
  if (scoped) where.kind = scoped;
  return prisma.notification.updateMany({
    where,
    data: { isRead: true },
  });
};

export const create = async (data) => {
  return prisma.notification.create({ data });
};
