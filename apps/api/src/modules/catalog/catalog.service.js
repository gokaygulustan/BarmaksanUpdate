import { prisma } from '../../lib/prisma.js';
import fs from 'fs';
import path from 'path';

export const getAll = async () => {
  return prisma.vendorCatalog.findMany({
    include: { vendor: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });
};

export const getMy = async (userId) => {
  const vendor = await prisma.vendor.findUnique({ where: { userId } });
  if (!vendor) return [];
  return prisma.vendorCatalog.findMany({
    where: { vendorId: vendor.id },
    orderBy: { createdAt: 'desc' },
  });
};

export const create = async ({ vendorId, originalName, filePath, fileSize }) => {
  return prisma.vendorCatalog.create({
    data: { vendorId, originalName, filePath, fileSize },
  });
};

export const remove = async (id, userId, role) => {
  const catalog = await prisma.vendorCatalog.findUnique({
    where: { id },
    include: { vendor: true },
  });
  if (!catalog) {
    const err = new Error('Catalog not found.');
    err.statusCode = 404;
    throw err;
  }
  // Only owner supplier or admin can delete
  if (role !== 'ADMIN' && catalog.vendor?.userId !== userId) {
    const err = new Error('Forbidden.');
    err.statusCode = 403;
    throw err;
  }
  // Delete file from disk
  const absPath = path.join(process.cwd(), catalog.filePath);
  if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  return prisma.vendorCatalog.delete({ where: { id } });
};
