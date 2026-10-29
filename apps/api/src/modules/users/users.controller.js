import * as usersService from './users.service.js';
import { createUserSchema, updateUserSchema } from './users.schema.js';

export const getAll = async (req, res, next) => {
  try {
    const users = await usersService.getAll(req.user);
    res.json(users);
  } catch (error) { next(error); }
};

export const getById = async (req, res, next) => {
  try {
    const user = await usersService.getById(req.params.id, req.user);
    res.json(user);
  } catch (error) { next(error); }
};

export const create = async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await usersService.create(data, req.user);
    res.status(201).json(user);
  } catch (error) { next(error); }
};

export const update = async (req, res, next) => {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await usersService.update(req.params.id, data, req.user);
    res.json(user);
  } catch (error) { next(error); }
};

export const remove = async (req, res, next) => {
  try {
    const result = await usersService.remove(req.params.id, req.user);
    if (result?.deleted) {
      return res.status(204).send();
    }
    // Geçmişi olan kullanıcı: pasife alındı
    res.json({
      ...result,
      softDeleted: true,
      message:
        result?.message ||
        'Bu kullanıcıya bağlı kayıtlar var; hesap pasife alındı.',
    });
  } catch (error) { next(error); }
};
