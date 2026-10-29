import * as mailOutboxService from './mail-outbox.service.js';

export const list = async (req, res, next) => {
  try {
    const data = await mailOutboxService.listMailOutbox({
      status: req.query.status,
      channel: req.query.channel,
      q: req.query.q,
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const getById = async (req, res, next) => {
  try {
    const row = await mailOutboxService.getMailOutboxById(req.params.id);
    if (!row) return res.status(404).json({ message: 'Kayıt bulunamadı.' });
    res.json(row);
  } catch (e) {
    next(e);
  }
};

export const seedPreviews = async (req, res, next) => {
  try {
    const result = await mailOutboxService.seedPreviews({
      viewerEmail: req.user?.email || null,
    });
    res.json({
      ok: true,
      count: result.count,
      message: `${result.count} örnek şablon mail günlüğüne yazıldı. Kimseye SMTP ile mail gitmedi.`,
    });
  } catch (e) {
    next(e);
  }
};

export const clearPreviews = async (req, res, next) => {
  try {
    const result = await mailOutboxService.clearPreviewMailOutbox();
    res.json({
      ok: true,
      count: result.count,
      message:
        result.count > 0
          ? `${result.count} örnek şablon silindi.`
          : 'Silinecek örnek şablon yok.',
    });
  } catch (e) {
    next(e);
  }
};

export const remove = async (req, res, next) => {
  try {
    const ok = await mailOutboxService.deleteMailOutboxById(req.params.id);
    if (!ok) return res.status(404).json({ message: 'Kayıt bulunamadı.' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const removeMany = async (req, res, next) => {
  try {
    const ids = req.body?.ids;
    const result = await mailOutboxService.deleteMailOutboxMany(ids);
    res.json({ ok: true, count: result.count });
  } catch (e) {
    next(e);
  }
};
