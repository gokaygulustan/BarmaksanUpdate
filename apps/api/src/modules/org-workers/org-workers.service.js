import { prisma } from '../../lib/prisma.js';

const assertAdmin = (user) => {
  if (user?.role === 'ADMIN') return;
  const err = new Error('Usta/çalışanları yalnızca sistem yöneticisi yönetir.');
  err.statusCode = 403;
  throw err;
};

/** Hızlı ekleme: Satın Alma da yeni usta/çalışan oluşturabilir. */
const assertCanCreate = (user) => {
  if (user?.role === 'ADMIN' || user?.role === 'PURCHASING') return;
  const err = new Error('Usta/çalışan ekleme yetkiniz yok.');
  err.statusCode = 403;
  throw err;
};

const cleanStr = (value, { field, min = 1, max = 80, required = true } = {}) => {
  const clean = String(value ?? '').trim();
  if (!clean) {
    if (!required) return null;
    const err = new Error(`${field} gerekli.`);
    err.statusCode = 400;
    throw err;
  }
  if (clean.length < min) {
    const err = new Error(`${field} en az ${min} karakter olmalı.`);
    err.statusCode = 400;
    throw err;
  }
  if (clean.length > max) {
    const err = new Error(`${field} en fazla ${max} karakter olabilir.`);
    err.statusCode = 400;
    throw err;
  }
  return clean;
};

const present = (row) => ({
  id: row.id,
  firstName: row.firstName,
  lastName: row.lastName,
  phone: row.phone,
  departmentId: row.departmentId,
  isActive: row.isActive,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  department: row.department
    ? {
        id: row.department.id,
        name: row.department.name,
        collarType: row.department.collarType,
        isActive: row.department.isActive,
      }
    : undefined,
  fullName: `${row.firstName} ${row.lastName}`.trim(),
});

const assertBlueCollarDept = async (departmentId) => {
  const dept = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!dept) {
    const err = new Error('Birim bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (dept.collarType !== 'BLUE_COLLAR') {
    const err = new Error('Usta/çalışan yalnızca mavi yaka birime bağlanabilir.');
    err.statusCode = 400;
    throw err;
  }
  return dept;
};

export const list = async (filters = {}) => {
  const where = {};
  if (filters.departmentId) where.departmentId = String(filters.departmentId);
  if (filters.active === true || filters.active === 'true' || filters.active === '1') {
    where.isActive = true;
  } else if (filters.active === false || filters.active === 'false' || filters.active === '0') {
    where.isActive = false;
  }
  const rows = await prisma.orgWorker.findMany({
    where,
    include: {
      department: {
        select: { id: true, name: true, collarType: true, isActive: true },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  return rows.map(present);
};

export const create = async (data, user) => {
  assertCanCreate(user);
  const firstName = cleanStr(data?.firstName, { field: 'Ad' });
  const lastName = cleanStr(data?.lastName, { field: 'Soyad' });
  const phone = cleanStr(data?.phone, { field: 'Telefon', required: false, min: 7, max: 30 });
  const departmentId = cleanStr(data?.departmentId, { field: 'Birim', max: 64 });
  await assertBlueCollarDept(departmentId);

  const row = await prisma.orgWorker.create({
    data: {
      firstName,
      lastName,
      phone,
      departmentId,
      isActive: data?.isActive === false ? false : true,
    },
    include: {
      department: {
        select: { id: true, name: true, collarType: true, isActive: true },
      },
    },
  });
  return present(row);
};

export const update = async (id, data, user) => {
  assertAdmin(user);
  const existing = await prisma.orgWorker.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Usta/çalışan bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const patch = {};
  if (data?.firstName != null) patch.firstName = cleanStr(data.firstName, { field: 'Ad' });
  if (data?.lastName != null) patch.lastName = cleanStr(data.lastName, { field: 'Soyad' });
  if (data?.phone !== undefined) {
    patch.phone = cleanStr(data.phone, { field: 'Telefon', required: false, min: 7, max: 30 });
  }
  if (data?.departmentId != null) {
    patch.departmentId = cleanStr(data.departmentId, { field: 'Birim', max: 64 });
    await assertBlueCollarDept(patch.departmentId);
  }
  if (typeof data?.isActive === 'boolean') patch.isActive = data.isActive;

  const row = await prisma.orgWorker.update({
    where: { id },
    data: patch,
    include: {
      department: {
        select: { id: true, name: true, collarType: true, isActive: true },
      },
    },
  });
  return present(row);
};

export const remove = async (id, user) => {
  assertAdmin(user);
  const existing = await prisma.orgWorker.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Usta/çalışan bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  const used = await prisma.procurementRequest.count({ where: { shopWorkerId: id } });
  if (used) {
    await prisma.orgWorker.update({ where: { id }, data: { isActive: false } });
    return { deactivated: true, id };
  }
  await prisma.orgWorker.delete({ where: { id } });
  return { deleted: true, id };
};
