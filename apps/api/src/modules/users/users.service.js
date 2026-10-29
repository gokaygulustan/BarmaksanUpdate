import { prisma } from '../../lib/prisma.js';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  moduleId: true,
  subRole: true,
  isExecutive: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

const UPDATE_FIELDS = new Set([
  'name',
  'email',
  'password',
  'role',
  'moduleId',
  'subRole',
  'isExecutive',
  'phone',
  'isActive',
]);

export const getAll = async (actorUser) => {
  if (actorUser?.role === 'ADMIN') {
    return prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } });
  }

  const actorModuleId = actorUser?.moduleId || 'URETIM_PLANLAMA';
  return prisma.user.findMany({
    where: {
      moduleId: actorModuleId,
      role: { in: ['PURCHASING', 'SUPPLIER'] },
    },
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  });
};

export const getById = async (id, actorUser) => {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  if (!user) {
    const err = new Error('Kullanıcı bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (actorUser && actorUser.role !== 'ADMIN') {
    if (user.moduleId !== actorUser.moduleId) {
      const err = new Error('Bu kullanıcıyı görüntüleme yetkiniz yok (Farklı Birim).');
      err.statusCode = 403;
      throw err;
    }
  }
  return user;
};

export const create = async (data, actorUser) => {
  const {
    name,
    email,
    password,
    role = 'PURCHASING',
    moduleId,
    subRole = 'STAFF',
    vendorName,
    isExecutive,
    phone,
  } = data;
  const rawPassword = password || randomBytes(24).toString('hex');
  const hashedPassword = await bcrypt.hash(rawPassword, 12);

  const targetModuleId =
    actorUser?.role === 'ADMIN' ? moduleId || 'URETIM_PLANLAMA' : actorUser?.moduleId || 'URETIM_PLANLAMA';
  const targetRole = actorUser?.role === 'ADMIN' ? role : 'PURCHASING';
  const execFlag = targetRole === 'ADMIN' ? true : actorUser?.isExecutive ? Boolean(isExecutive) : false;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: targetRole,
        moduleId: targetModuleId,
        subRole,
        isExecutive: execFlag,
        phone: phone || null,
        isActive: true,
      },
      select: userSelect,
    });

    if (role === 'SUPPLIER' && vendorName) {
      await tx.vendor.create({
        data: {
          name: vendorName,
          contactEmail: email,
          userId: user.id,
        },
      });
    }

    return user;
  });
};

export const update = async (id, { vendorId, ...raw }, actorUser) => {
  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    const err = new Error('Kullanıcı bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (actorUser && actorUser.role !== 'ADMIN') {
    if (existingUser.moduleId !== actorUser.moduleId) {
      const err = new Error('Bu kullanıcıyı düzenleme yetkiniz yok (Farklı Birim).');
      err.statusCode = 403;
      throw err;
    }
  }

  const data = {};
  for (const [key, value] of Object.entries(raw || {})) {
    if (!UPDATE_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    data[key] = value;
  }

  if (actorUser && actorUser.role !== 'ADMIN') {
    delete data.moduleId;
    delete data.isExecutive;
    delete data.role;
  }

  // Birim OTP → portal personeli: role + modül birlikte netleşsin
  if (data.role === 'DEPARTMENT') {
    data.moduleId = data.moduleId || 'BIRIM';
    data.isExecutive = false;
  }
  if (data.role === 'PURCHASING' && !data.moduleId && existingUser.role === 'DEPARTMENT') {
    data.moduleId = 'SATIN_ALMA';
  }
  if (data.role === 'ADMIN') data.isExecutive = true;

  if (typeof data.password === 'string' && data.password.trim()) {
    data.password = await bcrypt.hash(data.password.trim(), 12);
  } else {
    delete data.password;
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({ where: { id }, data, select: userSelect });

    if (data.role === 'SUPPLIER' && vendorId) {
      await tx.vendor.update({
        where: { id: vendorId },
        data: { userId: user.id },
      });
    }

    return user;
  });
};

const softDeactivate = async (id) =>
  prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: userSelect,
  });

export const remove = async (id, actorUser) => {
  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    const err = new Error('Kullanıcı bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (actorUser?.id === id) {
    const err = new Error('Kendi hesabınızı silemezsiniz.');
    err.statusCode = 400;
    throw err;
  }

  if (actorUser && actorUser.role !== 'ADMIN') {
    if (existingUser.moduleId !== actorUser.moduleId) {
      const err = new Error('Bu kullanıcıyı silme yetkiniz yok (Farklı Birim).');
      err.statusCode = 403;
      throw err;
    }
    if (existingUser.subRole === 'MANAGER') {
      const err = new Error('Birim müdürü silinemez.');
      err.statusCode = 400;
      throw err;
    }
  }

  try {
    await prisma.user.delete({ where: { id } });
    return { deleted: true };
  } catch (err) {
    // Bağlı kayıtlar (oluşturduğu talep, yorum, cari seçimi…) hard delete’i engeller → pasife al
    if (err?.code === 'P2003' || err?.code === 'P2014') {
      const user = await softDeactivate(id);
      return {
        ...user,
        softDeleted: true,
        message:
          'Bu kullanıcıya bağlı kayıtlar var (oluşturduğu birim/tedarik talebi, yorum veya cari seçimi). Hesap silinemedi; pasife alındı. İsterseniz Aktifleştir ile yeniden açabilirsiniz.',
      };
    }
    throw err;
  }
};
