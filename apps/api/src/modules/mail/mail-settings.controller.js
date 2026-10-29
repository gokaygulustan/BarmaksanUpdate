import * as mailSettingsService from './mail-settings.service.js';

export const get = async (req, res, next) => {
  try {
    const data = await mailSettingsService.getMailSettingsPublic();
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const b = req.body || {};
    const payload = {};

    if (b.host !== undefined) {
      const h = String(b.host).trim();
      if (!h) return res.status(400).json({ message: 'SMTP sunucusu (host) zorunludur.' });
      payload.host = h;
    }
    if (b.port !== undefined) {
      const p = parseInt(String(b.port), 10);
      if (!Number.isFinite(p) || p < 1 || p > 65535) {
        return res.status(400).json({ message: 'Geçerli bir port (1–65535) girin.' });
      }
      payload.port = p;
    }
    if (b.secure !== undefined) payload.secure = Boolean(b.secure);
    if (b.user !== undefined) payload.user = b.user ? String(b.user).trim() : null;
    if (b.pass !== undefined && b.pass !== '') payload.pass = String(b.pass);
    if (b.fromEmail !== undefined) payload.fromEmail = b.fromEmail ? String(b.fromEmail).trim() : null;
    if (b.fromName !== undefined) payload.fromName = b.fromName ? String(b.fromName).trim() : null;
    if (b.notificationsEnabled !== undefined) payload.notificationsEnabled = Boolean(b.notificationsEnabled);
    for (const key of [
      'notifyVendorQuote',
      'notifyQuoteReceived',
      'notifyApproval',
      'notifyOverLimit',
      'notifyWarehouse',
      'notifyDepartment',
      'notifyChat',
    ]) {
      if (b[key] !== undefined) payload[key] = Boolean(b[key]);
    }

    await mailSettingsService.updateMailSettings(payload);
    const data = await mailSettingsService.getMailSettingsPublic();
    res.json(data);
  } catch (e) {
    next(e);
  }
};

export const test = async (req, res, next) => {
  try {
    const to = (req.body?.to || req.user?.email || '').trim();
    if (!to) {
      return res.status(400).json({ message: 'Alıcı e-posta gerekli.' });
    }
    await mailSettingsService.sendTestMail(to);
    res.json({ ok: true, message: `Test e-postası gönderildi: ${to}` });
  } catch (e) {
    next(e);
  }
};
