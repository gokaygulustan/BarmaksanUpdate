import { prisma } from '../../lib/prisma.js';

export const getAll = async (vendorId = null, actorUser = null) => {
  const where = {};

  if (actorUser?.role === 'SUPPLIER') {
    const v = await prisma.vendor.findUnique({
      where: { userId: actorUser.id },
      select: { id: true },
    });
    if (!v?.id) return [];
    where.vendorId = v.id;
  } else if (vendorId) {
    where.vendorId = vendorId;
  }

  if (actorUser && actorUser.role !== 'ADMIN' && actorUser.role !== 'SUPPLIER') {
    const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
    where.vendor = {
      OR: [
        { moduleId: userModuleId },
        { user: { moduleId: userModuleId } },
      ],
    };
  }

  return prisma.product.findMany({
    where,
    include: { vendor: { select: { id: true, name: true, moduleId: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getById = async (id, actorUser = null) => {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { vendor: { select: { id: true, name: true, moduleId: true } } },
  });
  if (!product) {
    const err = new Error('Ürün bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (actorUser?.role === 'SUPPLIER') {
    const v = await prisma.vendor.findUnique({
      where: { userId: actorUser.id },
      select: { id: true },
    });
    if (!v?.id || product.vendorId !== v.id) {
      const err = new Error('Bu ürünü görüntüleme yetkiniz yok.');
      err.statusCode = 403;
      throw err;
    }
  } else if (actorUser && actorUser.role !== 'ADMIN') {
    const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
    if (product.vendor?.moduleId && product.vendor.moduleId !== userModuleId) {
      const err = new Error('Bu ürünü görüntüleme yetkiniz yok (Farklı Modül).');
      err.statusCode = 403;
      throw err;
    }
  }

  return product;
};

export const create = async (data, actorUser = null) => {
  const vendor = await prisma.vendor.findUnique({ where: { id: data.vendorId } });
  if (!vendor) {
    const err = new Error('Tedarikçi bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (actorUser?.role === 'SUPPLIER') {
    const v = await prisma.vendor.findUnique({ where: { userId: actorUser.id }, select: { id: true } });
    if (!v?.id || data.vendorId !== v.id) {
      const err = new Error('Yalnızca kendi kataloğunuza ürün ekleyebilirsiniz.');
      err.statusCode = 403;
      throw err;
    }
  }
  return prisma.product.create({ data });
};

export const update = async (id, data, actorUser = null) => {
  if (actorUser?.role === 'SUPPLIER') {
    await getById(id, actorUser);
  }
  return prisma.product.update({ where: { id }, data });
};

export const remove = async (id, actorUser = null) => {
  if (actorUser?.role === 'SUPPLIER') {
    await getById(id, actorUser);
  }
  return prisma.product.delete({ where: { id } });
};
