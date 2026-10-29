import * as vendorsService from './vendors.service.js';
import { createVendorSchema, updateVendorSchema } from './vendors.schema.js';

export const getAll = async (req, res, next) => {
  try { res.json(await vendorsService.getAll(req.user)); } catch (e) { next(e); }
};

export const getById = async (req, res, next) => {
  try { res.json(await vendorsService.getById(req.params.id, req.user)); } catch (e) { next(e); }
};

export const create = async (req, res, next) => {
  try {
    const data = createVendorSchema.parse(req.body);
    res.status(201).json(await vendorsService.create(data, req.user));
  } catch (e) { next(e); }
};

export const update = async (req, res, next) => {
  try {
    const data = updateVendorSchema.parse(req.body);
    res.json(await vendorsService.update(req.params.id, data, req.user));
  } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try {
    await vendorsService.remove(req.params.id, req.user);
    res.status(204).send();
  } catch (e) { next(e); }
};

export const getPurchaseHistory = async (req, res, next) => {
  try {
    const vendorId = req.params.id || req.query.vendorId || null;
    res.json(await vendorsService.getPurchaseHistory(vendorId, req.user));
  } catch (e) { next(e); }
};
