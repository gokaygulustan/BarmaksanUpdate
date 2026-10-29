import * as service from './notification-cc-contacts.service.js';
import { createContactSchema, updateContactSchema } from './notification-cc-contacts.schema.js';

export const getAll = async (req, res, next) => {
  try {
    res.json(await service.list());
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    const data = createContactSchema.parse(req.body);
    res.status(201).json(await service.create(data));
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const data = updateContactSchema.parse(req.body);
    res.json(await service.update(req.params.id, data));
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    await service.remove(req.params.id);
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};
