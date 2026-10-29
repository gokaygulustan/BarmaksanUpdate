import * as unitsService from './units.service.js';
import { createUnitSchema, resolveUnitSchema } from './units.schema.js';

export const getAll = async (req, res, next) => {
  try {
    res.json(await unitsService.getAll());
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    const { name } = createUnitSchema.parse(req.body);
    res.status(201).json(await unitsService.create(name));
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    await unitsService.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};

export const resolve = async (req, res, next) => {
  try {
    const { name } = resolveUnitSchema.parse(req.body);
    res.json(await unitsService.resolve(name));
  } catch (e) {
    next(e);
  }
};

export const resolveMany = async (req, res, next) => {
  try {
    const { names } = req.body;
    if (!Array.isArray(names)) {
      return res.status(400).json({ message: 'names must be an array' });
    }
    res.json(await unitsService.resolveMany(names));
  } catch (e) {
    next(e);
  }
};
