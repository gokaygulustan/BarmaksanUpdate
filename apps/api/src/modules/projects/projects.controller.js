import * as service from './projects.service.js';

export const list = async (req, res, next) => {
  try {
    res.json(
      await service.list(req.user, {
        moduleId: req.query.moduleId,
        includeInactive: req.query.includeInactive === '1' || req.query.includeInactive === 'true',
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
    res.json(await service.remove(req.params.id, req.user));
  } catch (e) {
    next(e);
  }
};

export const moveRequests = async (req, res, next) => {
  try {
    res.json(await service.moveRequests(req.params.id, req.body?.requestIds, req.user));
  } catch (e) {
    next(e);
  }
};
