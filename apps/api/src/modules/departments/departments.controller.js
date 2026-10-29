import * as service from './departments.service.js';

export const list = async (req, res, next) => {
  try {
    res.json(
      await service.list({
        collarType: req.query.collarType,
        active: req.query.active,
      })
    );
  } catch (e) {
    next(e);
  }
};

export const create = async (req, res, next) => {
  try {
    res.status(201).json(await service.create(req.body || {}, req.user));
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    res.json(await service.update(req.params.id, req.body || {}, req.user));
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    const result = await service.remove(req.params.id, req.user);
    if (result?.deactivated) {
      res.json(result);
      return;
    }
    res.status(204).send();
  } catch (e) {
    next(e);
  }
};
