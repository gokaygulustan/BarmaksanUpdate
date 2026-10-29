import * as catalogService from './catalog.service.js';
import { prisma } from '../../lib/prisma.js';

export const getAll = async (req, res, next) => {
  try {
    const catalogs = await catalogService.getAll();
    res.json(catalogs);
  } catch (err) {
    next(err);
  }
};

export const getMy = async (req, res, next) => {
  try {
    const catalogs = await catalogService.getMy(req.user.id);
    res.json(catalogs);
  } catch (err) {
    next(err);
  }
};

export const upload = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded.' });
    }
    const vendor = await prisma.vendor.findUnique({ where: { userId: req.user.id } });
    if (!vendor) {
      return res.status(403).json({ message: 'No vendor profile found for this user.' });
    }

    const catalog = await catalogService.create({
      vendorId: vendor.id,
      originalName: req.file.originalname,
      filePath: req.file.path.replace(/\\/g, '/'),
      fileSize: req.file.size,
    });
    res.status(201).json(catalog);
  } catch (err) {
    next(err);
  }
};

export const remove = async (req, res, next) => {
  try {
    await catalogService.remove(req.params.id, req.user.id, req.user.role);
    res.json({ message: 'Catalog deleted.' });
  } catch (err) {
    next(err);
  }
};
