import * as notificationsService from './notifications.service.js';

export const getForUser = async (req, res, next) => {
  try { res.json(await notificationsService.getForUser(req.user.id)); } catch (e) { next(e); }
};

export const listForUser = async (req, res, next) => {
  try { res.json(await notificationsService.listForUser(req.user.id, req.query)); } catch (e) { next(e); }
};

export const markAsRead = async (req, res, next) => {
  try { res.json(await notificationsService.markAsRead(req.params.id, req.user.id)); } catch (e) { next(e); }
};

export const markAsUnread = async (req, res, next) => {
  try { res.json(await notificationsService.markAsUnread(req.params.id, req.user.id)); } catch (e) { next(e); }
};

export const markManyAsRead = async (req, res, next) => {
  try {
    res.json(
      await notificationsService.markManyAsRead(req.user.id, req.body?.ids, req.body?.isRead !== false),
    );
  } catch (e) { next(e); }
};

export const markAllAsRead = async (req, res, next) => {
  try { res.json(await notificationsService.markAllAsRead(req.user.id, req.query.kind)); } catch (e) { next(e); }
};

export const remove = async (req, res, next) => {
  try { res.json(await notificationsService.remove(req.params.id, req.user.id)); } catch (e) { next(e); }
};

export const removeMany = async (req, res, next) => {
  try { res.json(await notificationsService.removeMany(req.user.id, req.body?.ids)); } catch (e) { next(e); }
};
