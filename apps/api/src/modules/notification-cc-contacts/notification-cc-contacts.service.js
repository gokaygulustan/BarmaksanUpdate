import { prisma } from '../../lib/prisma.js';

export const MAX_NOTIFICATION_CC_CONTACTS = 40;

export const list = async () => {
  return prisma.procurementNotificationCcContact.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
};

export const create = async (data) => {
  const count = await prisma.procurementNotificationCcContact.count();
  if (count >= MAX_NOTIFICATION_CC_CONTACTS) {
    const err = new Error(`En fazla ${MAX_NOTIFICATION_CC_CONTACTS} kişi tanımlanabilir.`);
    err.statusCode = 400;
    throw err;
  }
  const email = String(data.email).trim().toLowerCase();
  return prisma.procurementNotificationCcContact.create({
    data: {
      name: String(data.name).trim(),
      email,
      sortOrder: data.sortOrder ?? 0,
    },
  });
};

export const update = async (id, data) => {
  const row = await prisma.procurementNotificationCcContact.findUnique({ where: { id } });
  if (!row) {
    const err = new Error('Kayıt bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  const patch = {};
  if (data.name !== undefined) patch.name = String(data.name).trim();
  if (data.email !== undefined) patch.email = String(data.email).trim().toLowerCase();
  if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
  return prisma.procurementNotificationCcContact.update({
    where: { id },
    data: patch,
  });
};

export const remove = async (id) => {
  const row = await prisma.procurementNotificationCcContact.findUnique({ where: { id } });
  if (!row) {
    const err = new Error('Kayıt bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  await prisma.procurementNotificationCcContact.delete({ where: { id } });
};
