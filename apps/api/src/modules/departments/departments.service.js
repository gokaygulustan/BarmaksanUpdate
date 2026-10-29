import { prisma } from '../../lib/prisma.js';

const UNIT_SEP = ' · ';
const COLLAR_TYPES = new Set(['WHITE_COLLAR', 'BLUE_COLLAR']);

const assertAdmin = (user) => {
  if (user?.role === 'ADMIN') return;
  const err = new Error('Birimleri yalnızca sistem yöneticisi yönetir.');
  err.statusCode = 403;
  throw err;
};

const cleanName = (name) => {
  const clean = String(name || '').trim();
  if (clean.length < 2) {
    const err = new Error('Birim adı en az 2 karakter olmalı.');
    err.statusCode = 400;
    throw err;
  }
  if (clean.length > 120) {
    const err = new Error('Birim adı en fazla 120 karakter olabilir.');
    err.statusCode = 400;
    throw err;
  }
  return clean;
};

const parseCollarType = (value, { required = false, fallback = 'WHITE_COLLAR' } = {}) => {
  if (value == null || value === '') {
    if (required) {
      const err = new Error('Birim tipi gerekli.');
      err.statusCode = 400;
      throw err;
    }
    return fallback;
  }
  const v = String(value).trim().toUpperCase();
  if (!COLLAR_TYPES.has(v)) {
    const err = new Error('Geçersiz birim tipi.');
    err.statusCode = 400;
    throw err;
  }
  return v;
};

export const unitSegments = (raw) =>
  String(raw || '')
    .split(UNIT_SEP)
    .map((s) => s.trim())
    .filter(Boolean);

export const requestUsesUnit = (raw, name) => unitSegments(raw).includes(name);

export const renameUnitIn = (raw, from, to) =>
  unitSegments(raw)
    .map((s) => (s === from ? to : s))
    .join(UNIT_SEP);

const requestsUsingName = async (name) => {
  const rows = await prisma.internalRequest.findMany({
    where: { requesterUnit: { contains: name } },
    select: { id: true, requesterUnit: true },
  });
  return rows.filter((r) => requestUsesUnit(r.requesterUnit, name));
};

const shopRequestCount = async (departmentId) =>
  prisma.procurementRequest.count({ where: { shopDepartmentId: departmentId } });

const withCounts = async (depts) => {
  const rows = await prisma.internalRequest.findMany({
    select: { requesterUnit: true },
  });
  const shopCounts = await Promise.all(depts.map((d) => shopRequestCount(d.id)));
  return depts.map((d, i) => ({
    ...d,
    requestCount:
      rows.filter((r) => requestUsesUnit(r.requesterUnit, d.name)).length + shopCounts[i],
  }));
};

/**
 * @param {{ collarType?: string, active?: string|boolean }} [filters]
 */
export const list = async (filters = {}) => {
  const where = {};
  if (filters.collarType) {
    where.collarType = parseCollarType(filters.collarType, { required: true });
  }
  if (filters.active === true || filters.active === 'true' || filters.active === '1') {
    where.isActive = true;
  } else if (filters.active === false || filters.active === 'false' || filters.active === '0') {
    where.isActive = false;
  }

  const depts = await prisma.department.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return withCounts(depts);
};

/**
 * @param {{ name: string, collarType?: string, isActive?: boolean }} data
 */
export const create = async (data, user) => {
  assertAdmin(user);
  const clean = cleanName(typeof data === 'string' ? data : data?.name);
  const collarType = parseCollarType(
    typeof data === 'string' ? undefined : data?.collarType,
    { fallback: 'WHITE_COLLAR' }
  );
  const isActive =
    typeof data === 'object' && data?.isActive === false ? false : true;

  const exists = await prisma.department.findFirst({
    where: { name: { equals: clean, mode: 'insensitive' } },
  });
  if (exists) {
    const err = new Error('Bu birim zaten var.');
    err.statusCode = 409;
    throw err;
  }
  const last = await prisma.department.aggregate({ _max: { sortOrder: true } });
  const row = await prisma.department.create({
    data: {
      name: clean,
      sortOrder: (last._max.sortOrder || 0) + 1,
      collarType,
      isActive,
    },
  });
  return { ...row, requestCount: 0 };
};

/**
 * @param {{ name?: string, collarType?: string, isActive?: boolean }} data
 */
export const update = async (id, data, user) => {
  assertAdmin(user);
  const row = await prisma.department.findUnique({ where: { id } });
  if (!row) {
    const err = new Error('Birim bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const patch = {};
  const incomingName = typeof data === 'string' ? data : data?.name;
  if (incomingName != null && String(incomingName).trim() !== '') {
    patch.name = cleanName(incomingName);
  }
  if (typeof data === 'object' && data?.collarType != null) {
    patch.collarType = parseCollarType(data.collarType, { required: true });
  }
  if (typeof data === 'object' && typeof data?.isActive === 'boolean') {
    patch.isActive = data.isActive;
  }

  if (patch.name && patch.name !== row.name) {
    const clash = await prisma.department.findFirst({
      where: { name: { equals: patch.name, mode: 'insensitive' }, NOT: { id } },
    });
    if (clash) {
      const err = new Error('Bu birim adı zaten kullanılıyor.');
      err.statusCode = 409;
      throw err;
    }
    const used = await requestsUsingName(row.name);
    await prisma.$transaction([
      prisma.department.update({ where: { id }, data: patch }),
      ...used.map((r) =>
        prisma.internalRequest.update({
          where: { id: r.id },
          data: { requesterUnit: renameUnitIn(r.requesterUnit, row.name, patch.name) },
        })
      ),
    ]);
    const updated = await prisma.department.findUnique({ where: { id } });
    const usedAfter = await requestsUsingName(updated.name);
    const shop = await shopRequestCount(id);
    return { ...updated, requestCount: usedAfter.length + shop };
  }

  if (Object.keys(patch).length === 0) {
    const used = await requestsUsingName(row.name);
    const shop = await shopRequestCount(id);
    return { ...row, requestCount: used.length + shop };
  }

  const updated = await prisma.department.update({ where: { id }, data: patch });
  const used = await requestsUsingName(updated.name);
  const shop = await shopRequestCount(id);
  return { ...updated, requestCount: used.length + shop };
};

/** Soft-deactivate when linked; hard-delete only if unused. */
export const remove = async (id, user) => {
  assertAdmin(user);
  const row = await prisma.department.findUnique({ where: { id } });
  if (!row) {
    const err = new Error('Birim bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  const used = await requestsUsingName(row.name);
  const shop = await shopRequestCount(id);
  const workerCount = await prisma.orgWorker.count({ where: { departmentId: id } });
  if (used.length || shop || workerCount) {
    await prisma.department.update({ where: { id }, data: { isActive: false } });
    return { deactivated: true, id };
  }
  await prisma.department.delete({ where: { id } });
  return { deleted: true, id };
};
