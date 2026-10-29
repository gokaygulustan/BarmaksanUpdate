import * as smsService from './sms.service.js';

export const get = async (req, res, next) => {
  try {
    res.json(await smsService.getSmsSettingsPublic());
  } catch (e) {
    next(e);
  }
};

export const update = async (req, res, next) => {
  try {
    const b = req.body || {};
    const payload = {};
    if (b.usercode !== undefined) payload.usercode = b.usercode;
    if (b.msgheader !== undefined) payload.msgheader = b.msgheader;
    if (b.isActive !== undefined) payload.isActive = b.isActive;
    if (b.password !== undefined && b.password !== '') payload.password = String(b.password);
    await smsService.updateSmsSettings(payload);
    res.json(await smsService.getSmsSettingsPublic());
  } catch (e) {
    next(e);
  }
};

export const test = async (req, res, next) => {
  try {
    const to = String(req.body?.to || req.user?.phone || '').trim();
    if (!to) {
      return res.status(400).json({ message: 'Alıcı telefon numarası gerekli.' });
    }
    const result = await smsService.sendTestSms(to);
    res.json({ ok: true, message: `Test SMS gönderildi: ${result.to}` });
  } catch (e) {
    next(e);
  }
};
