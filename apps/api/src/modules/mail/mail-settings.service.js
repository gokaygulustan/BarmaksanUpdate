import { prisma } from '../../lib/prisma.js';
import nodemailer from 'nodemailer';
import { getFrontendBaseUrl } from '../../config/frontendUrl.js';
import {
  buildPortalEmailHTML,
  buildOtpEmailHTML,
  buildPasswordResetEmailHTML,
  escapeHtml,
  htmlToPlainText,
  mailSayinGreeting,
  mailStrong,
  mailSubject,
} from './mail-layout.js';
import { withMailLogo } from './mail-logo.js';
import { isIsolatedMailbox, mailSinkActive } from '../../lib/mailSink.js';

/** Bildirim kanalları — Ayarlar → Bildirimler’de ayrı aç/kapa. */
export const MAIL_CHANNEL = {
  VENDOR_QUOTE: 'vendorQuote',
  VENDOR_APPROVED: 'vendorApproved',
  QUOTE_RECEIVED: 'quoteReceived',
  APPROVAL: 'approval',
  OVER_LIMIT: 'overLimit',
  WAREHOUSE: 'warehouse',
  DEPARTMENT: 'department',
  CHAT: 'chat',
};

const CHANNEL_TO_COLUMN = {
  [MAIL_CHANNEL.VENDOR_QUOTE]: 'notifyVendorQuote',
  /** Ayarlarda "Tedarikçi" anahtarı ikisini birlikte açıp kapatır. */
  [MAIL_CHANNEL.VENDOR_APPROVED]: 'notifyVendorQuote',
  [MAIL_CHANNEL.QUOTE_RECEIVED]: 'notifyQuoteReceived',
  [MAIL_CHANNEL.APPROVAL]: 'notifyApproval',
  [MAIL_CHANNEL.OVER_LIMIT]: 'notifyOverLimit',
  [MAIL_CHANNEL.WAREHOUSE]: 'notifyWarehouse',
  [MAIL_CHANNEL.DEPARTMENT]: 'notifyDepartment',
  [MAIL_CHANNEL.CHAT]: 'notifyChat',
};

const CHANNEL_DEFAULTS = {
  notifyVendorQuote: true,
  notifyQuoteReceived: true,
  notifyApproval: true,
  notifyOverLimit: true,
  notifyWarehouse: true,
  notifyDepartment: true,
  notifyChat: true,
};

const readChannels = (row) => ({
  notifyVendorQuote: row?.notifyVendorQuote !== false,
  notifyQuoteReceived: row?.notifyQuoteReceived !== false,
  notifyApproval: row?.notifyApproval !== false,
  notifyOverLimit: row?.notifyOverLimit !== false,
  notifyWarehouse: row?.notifyWarehouse !== false,
  notifyDepartment: row?.notifyDepartment !== false,
  notifyChat: row?.notifyChat !== false,
});

/** Prisma client henüz generate edilmemiş olsa bile kanalları okur. */
const readChannelsFromDb = async () => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        "notifyVendorQuote",
        "notifyQuoteReceived",
        "notifyApproval",
        "notifyOverLimit",
        "notifyWarehouse",
        "notifyDepartment",
        "notifyChat"
      FROM mail_settings
      WHERE id = 'default'
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    return readChannels(row);
  } catch {
    return { ...CHANNEL_DEFAULTS };
  }
};

const anyChannelOn = (channels) => Object.values(channels).some(Boolean);

export const ensureMailSettingsRow = async () => {
  await prisma.mailSettings.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
    },
    update: {},
  });
};

/**
 * API yanıtı — şifre maskelenir.
 */
export const getMailSettingsPublic = async () => {
  await ensureMailSettingsRow();
  const row = await prisma.mailSettings.findUnique({ where: { id: 'default' } });
  if (!row) return null;
  const channels = await readChannelsFromDb();
  return {
    host: row.host,
    port: row.port,
    secure: row.secure,
    user: row.user,
    hasPassword: Boolean(row.pass?.length),
    fromEmail: row.fromEmail,
    fromName: row.fromName,
    /** Geriye dönük: en az bir kanal açıksa true */
    notificationsEnabled: anyChannelOn(channels),
    ...channels,
  };
};

/**
 * Nodemailer + DB/env birleşimi (gönderim için).
 */
export const getResolvedTransporterConfig = async () => {
  await ensureMailSettingsRow();
  const row = await prisma.mailSettings.findUnique({ where: { id: 'default' } });

  const host = (row?.host || process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port =
    row?.port != null
      ? row.port
      : parseInt(process.env.SMTP_PORT || '587', 10);

  let secure = row?.secure;
  if (secure === undefined || secure === null) {
    if (process.env.SMTP_SECURE === 'true') secure = true;
    else if (process.env.SMTP_SECURE === 'false') secure = false;
    else secure = port === 465;
  }

  const user = (row?.user || process.env.SMTP_USER || '').trim() || undefined;
  const pass = (row?.pass || process.env.SMTP_PASS || '') || undefined;
  const auth = user && pass ? { user, pass } : undefined;

  return { host, port, secure, auth };
};

export const getResolvedFromAddress = async () => {
  await ensureMailSettingsRow();
  const row = await prisma.mailSettings.findUnique({ where: { id: 'default' } });

  if (process.env.SMTP_FROM && !row?.fromEmail && !row?.fromName) {
    return process.env.SMTP_FROM;
  }

  const email = (row?.fromEmail || process.env.SMTP_FROM_EMAIL || '').trim() || 'noreply@local.test';
  const name = (row?.fromName || '').trim() || 'Tedarik Portalı';
  return `"${name}" <${email}>`;
};

export const updateMailSettings = async (data) => {
  const { pass, notificationsEnabled, ...rest } = data;
  const update = { ...rest };

  if (pass !== undefined && pass !== '' && pass !== null) {
    update.pass = pass;
  }

  // Eski tek anahtar → tüm kanalları birlikte aç/kapa
  if (notificationsEnabled !== undefined) {
    const on = Boolean(notificationsEnabled);
    update.notifyVendorQuote = on;
    update.notifyQuoteReceived = on;
    update.notifyApproval = on;
    update.notifyOverLimit = on;
    update.notifyWarehouse = on;
    update.notifyDepartment = on;
    update.notifyChat = on;
    update.notificationsEnabled = on;
  }

  await ensureMailSettingsRow();

  const channelKeys = [
    'notifyVendorQuote',
    'notifyQuoteReceived',
    'notifyApproval',
    'notifyOverLimit',
    'notifyWarehouse',
    'notifyDepartment',
    'notifyChat',
  ];
  const channelPatch = {};
  for (const k of channelKeys) {
    if (update[k] !== undefined) {
      channelPatch[k] = Boolean(update[k]);
      delete update[k];
    }
  }

  const keys = Object.keys(update).filter((k) => update[k] !== undefined);
  if (keys.length > 0) {
    await prisma.mailSettings.update({
      where: { id: 'default' },
      data: update,
    });
  }

  if (Object.keys(channelPatch).length > 0) {
    const entries = Object.entries(channelPatch);
    const setSql = entries.map(([k], i) => `"${k}" = $${i + 1}`).join(', ');
    const values = entries.map(([, v]) => v);
    await prisma.$executeRawUnsafe(
      `UPDATE mail_settings SET ${setSql} WHERE id = 'default'`,
      ...values,
    );
    const channels = await readChannelsFromDb();
    await prisma.mailSettings.update({
      where: { id: 'default' },
      data: { notificationsEnabled: anyChannelOn(channels) },
    });
  }
};

export const createTransporterFromSettings = async () => {
  const cfg = await getResolvedTransporterConfig();
  return nodemailer.createTransport(cfg);
};

export const isMailChannelEnabled = async (channel) => {
  if (!channel || !CHANNEL_TO_COLUMN[channel]) return false;
  await ensureMailSettingsRow();
  const channels = await readChannelsFromDb();
  const col = CHANNEL_TO_COLUMN[channel];
  return channels[col] !== false;
};

const normalizeMailAddr = (v) => {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.map((x) => String(x ?? '').trim()).filter(Boolean).join(', ');
  return String(v).trim();
};

const buildPlainSnippet = (html, text) => {
  const plain = htmlToPlainText(html || text || '');
  return plain ? plain.slice(0, 280) : null;
};

const persistMailOutbox = async (data) => {
  try {
    await prisma.mailOutbox.create({ data });
  } catch (err) {
    console.error('[mail] outbox log failed:', err?.message || err);
  }
};

const mailboxEmail = (v) => {
  const s = String(v || '').trim();
  if (!s) return '';
  const angle = s.match(/<([^>]+)>/);
  return (angle ? angle[1] : s).trim().toLowerCase();
};

/**
 * Satın alma ekibi: aktif SATIN_ALMA personeli + yetkili. Depo sorumlusu, pasif kullanıcı,
 * ADMIN ve üst yönetim girmez; liste her gönderimde DB'den okunur.
 */
export const getSatinAlmaTeamEmails = async () => {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: 'PURCHASING',
      moduleId: 'SATIN_ALMA',
      subRole: { in: ['STAFF', 'MANAGER'] },
    },
    select: { email: true },
  });
  return [...new Set(users.map((u) => mailboxEmail(u.email)).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
};

const splitMailList = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(','))
    .map((x) => String(x ?? '').trim())
    .filter(Boolean);

/**
 * teamCc: ekibi CC'ye ekler; To/CC'de veya teamCcExclude'da olanlar tekrar eklenmez.
 * Tek kullanımlık bağlantı (token) içeren maillerde kullanılmaz.
 */
const mergeTeamCc = async (options) => {
  if (!options?.teamCc) return options?.cc;
  const existing = splitMailList(options.cc);
  const skip = new Set(
    [...splitMailList(options.to), ...existing, ...splitMailList(options.teamCcExclude)].map(mailboxEmail),
  );
  const team = (await getSatinAlmaTeamEmails()).filter((e) => !skip.has(e));
  return [...existing, ...team];
};

/** Mailin uygulama içi bildirim kopyası: kanal etiketi (mail_outbox ile aynı dil). */
const NOTIFY_CHANNEL_LABELS = {
  [MAIL_CHANNEL.VENDOR_APPROVED]: 'Tedarikçiye onay bildirimi',
  [MAIL_CHANNEL.QUOTE_RECEIVED]: 'Teklif bildirimi',
  [MAIL_CHANNEL.APPROVAL]: 'Onay',
  [MAIL_CHANNEL.OVER_LIMIT]: 'Limit aşımı',
  [MAIL_CHANNEL.WAREHOUSE]: 'Depo teslim',
  [MAIL_CHANNEL.DEPARTMENT]: 'Birim talebi',
};

/** Yalnızca oturum gerektiren panel sayfaları; token'lı dış bağlantılar bildirime taşınmaz. */
const NOTIFY_LINK_RE =
  /^\/(procurement|internal-requests|taleplerim|dashboard|vendors|vendor-history|price-history|settings|analysis-reports|my-products|users)(\/|$|\?)/;

const portalPathFromHtml = (html) => {
  if (!html) return null;
  const base = getFrontendBaseUrl().replace(/\/+$/, '');
  const re = /href="([^"]+)"/g;
  let m;
  while ((m = re.exec(String(html))) !== null) {
    const href = m[1].replace(/&amp;/g, '&');
    if (!href.startsWith(base)) continue;
    const path = href.slice(base.length) || '/';
    if (NOTIFY_LINK_RE.test(path)) return path;
  }
  return null;
};

const subjectHead = (subject) => String(subject || '').split(' // ')[0].trim();

const NOTIFY_DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const NOTIFY_DELAY_MS = 4000;

/**
 * Mail giden her aktif iç kullanıcıya (To/CC/BCC) bildirim yazar. Akış zaten aynı linkle
 * bildirim üretmişse tekrar yazılmaz; gecikme, mailden sonra yazılan bildirimleri de yakalamak için.
 */
const mirrorMailToNotifications = ({ channel, to, cc, bcc, subject, html, notify }) => {
  if (notify === false) return;
  const label = NOTIFY_CHANNEL_LABELS[channel];
  if (!label) return;
  const emails = [...new Set([to, cc, bcc].flatMap(splitMailList).map(mailboxEmail).filter(Boolean))]
    .filter((email) => !mailSinkActive() || isIsolatedMailbox(email));
  if (!emails.length) return;
  const link = notify?.link !== undefined ? notify.link : portalPathFromHtml(html);
  const head = subjectHead(subject);
  const message = notify?.message || (head ? `${label}: "${head}"` : label);
  const sentAt = Date.now();

  const timer = setTimeout(async () => {
    try {
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          role: { not: 'SUPPLIER' },
          OR: emails.map((email) => ({ email: { equals: email, mode: 'insensitive' } })),
        },
        select: { id: true },
      });
      if (!users.length) return;
      const since = new Date(sentAt - NOTIFY_DEDUPE_WINDOW_MS);
      const existing = await prisma.notification.findMany({
        where: {
          userId: { in: users.map((u) => u.id) },
          createdAt: { gte: since },
          ...(notify?.message || !link ? { message } : { link }),
        },
        select: { userId: true },
      });
      const skip = new Set(existing.map((n) => n.userId));
      const rows = users
        .filter((u) => !skip.has(u.id))
        .map((u) => ({ userId: u.id, kind: 'ALERT', message, link: link || null }));
      if (rows.length) await prisma.notification.createMany({ data: rows });
    } catch (err) {
      console.error('[mail] notification mirror failed:', err?.message || err);
    }
  }, NOTIFY_DELAY_MS);
  timer.unref?.();
};

/**
 * OTP ve SMTP testi hariç mailler kanal bayrağından geçer.
 * Her deneme mail_outbox’a yazılır (SENT / SKIPPED / FAILED).
 * @param {{ bypassGate?: boolean, channel?: string, meta?: object }} opts
 */
export const dispatchMail = async (rawOptions, { bypassGate = false, channel = null, meta = null } = {}) => {
  const { teamCc: _teamCc, teamCcExclude: _teamCcExclude, notify, ...baseOptions } = rawOptions || {};
  const mergedCc = await mergeTeamCc(rawOptions);
  const options = { ...baseOptions, ...(mergedCc && splitMailList(mergedCc).length ? { cc: mergedCc } : { cc: undefined }) };
  const to = normalizeMailAddr(options?.to);
  const cc = normalizeMailAddr(options?.cc) || null;
  const bcc = normalizeMailAddr(options?.bcc) || null;
  const subject = String(options?.subject || '').slice(0, 500) || '(konu yok)';
  const htmlBody = options?.html != null ? String(options.html) : null;
  const textBody = options?.text != null ? String(options.text) : null;
  const plainSnippet = buildPlainSnippet(htmlBody, textBody);
  const logChannel = channel || (bypassGate ? 'system' : null);
  const replyToRaw = normalizeMailAddr(options?.replyTo) || null;

  const baseLog = {
    channel: logChannel,
    to: to || '(alıcı yok)',
    cc,
    bcc,
    subject,
    htmlBody,
    textBody,
    plainSnippet,
    ...(meta != null || replyToRaw ? { meta: { ...(meta || {}), ...(replyToRaw ? { replyTo: replyToRaw } : {}) } } : {}),
  };

  if (!bypassGate) {
    if (!channel) {
      console.warn('[mail] Kanal belirtilmedi, atlandı:', options?.subject, options?.to);
      await persistMailOutbox({ ...baseLog, status: 'SKIPPED', skipReason: 'missing_channel' });
      return { skipped: true, reason: 'missing_channel' };
    }
    mirrorMailToNotifications({ channel, to, cc, bcc, subject, html: htmlBody, notify });
    const enabled = await isMailChannelEnabled(channel);
    if (!enabled) {
      console.log(`[mail] Kanal kapalı (${channel}), atlandı:`, options?.subject, options?.to);
      await persistMailOutbox({ ...baseLog, status: 'SKIPPED', skipReason: 'channel_off', channel });
      return { skipped: true, reason: 'channel_off', channel };
    }
  }

  if (process.env.MAIL_SINK === 'outbox') {
    await persistMailOutbox({ ...baseLog, status: 'SKIPPED', skipReason: 'mail_sink' });
    return { skipped: true, reason: 'mail_sink', channel };
  }

  try {
    const transporter = await createTransporterFromSettings();
    const from = options.from || (await getResolvedFromAddress());
    const replyTo =
      replyToRaw && mailboxEmail(replyToRaw) !== mailboxEmail(from) ? replyToRaw : undefined;
    const { replyTo: _omitReplyTo, ...rest } = options;
    const prepared = withMailLogo({
      ...rest,
      from,
      ...(replyTo ? { replyTo } : {}),
    });
    const info = await transporter.sendMail(prepared);
    const messageId = info?.messageId || null;
    if (messageId) {
      console.log(`[mail] messageId=${messageId} → ${options?.to}`);
    }
    await persistMailOutbox({
      ...baseLog,
      htmlBody: prepared.html != null ? String(prepared.html) : htmlBody,
      status: 'SENT',
      messageId,
    });
    return { skipped: false, messageId };
  } catch (err) {
    await persistMailOutbox({
      ...baseLog,
      status: 'FAILED',
      errorMessage: String(err?.message || err).slice(0, 2000),
    });
    throw err;
  }
};

export const sendTestMail = async (to) => {
  const html = buildPortalEmailHTML({
    kicker: 'SMTP doğrulama',
    heading: 'Test iletisi',
    bodyHtml:
      '<p style="margin:0;">Bu bir test iletisidir. SMTP ayarlarınız çalışıyor.</p>',
    portalUrl: getFrontendBaseUrl(),
  });
  await dispatchMail(
    {
      to,
      subject: mailSubject('SMTP doğrulama'),
      text: 'Bu bir test iletisidir. SMTP ayarlarınız çalışıyor.',
      html,
    },
    { bypassGate: true, channel: 'smtp_test' }
  );
};

const emailLocalPart = (email) => String(email || '').split('@')[0] || '';

/** Mail hitabı: ecatar@... → ECATAR */
const departmentMailName = (email) => {
  const local = emailLocalPart(email);
  return local ? local.toUpperCase() : 'YETKİLİ';
};

export const sendPasswordResetMail = async (to, code) => {
  const html = buildPasswordResetEmailHTML({
    toName: departmentMailName(to),
    code,
    portalUrl: getFrontendBaseUrl(),
  });
  await dispatchMail(
    {
      to,
      subject: mailSubject('Şifre sıfırlama kodu'),
      html,
    },
    { bypassGate: true, channel: 'otp' }
  );
};

export const sendOtpMail = async (to, code, loginUrl) => {
  const html = buildOtpEmailHTML({
    toName: departmentMailName(to),
    code,
    loginUrl,
    portalUrl: getFrontendBaseUrl(),
  });
  await dispatchMail(
    {
      to,
      subject: mailSubject('Doğrulama kodu'),
      html,
    },
    { bypassGate: true, channel: 'otp' }
  );
};

const mailMetaRows = (rows) =>
  rows
    .filter(Boolean)
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:8px 0;font-size:12px;color:#64748b;width:120px;vertical-align:top;">${k}</td>
          <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${v}</td>
        </tr>`
    )
    .join('');

const mailNoteBlock = (label, text) => {
  const plain = text ? htmlToPlainText(text) || String(text).trim() : '';
  if (!plain) return { html: '', plain: '' };
  return {
    plain,
    html: `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">${escapeHtml(
          label
        )}</div>
        <div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(
          plain
        )}</div>
      </div>`,
  };
};

/** Personel / birim, yetkiliye (Mahmut) talep iletince. */
export const buildDepartmentRequestMail = ({
  title,
  requesterName,
  requesterEmail,
  requesterUnit,
  description,
  link,
  recipientName,
} = {}) => {
  const heading = title || 'Yeni talep';
  const note = mailNoteBlock('Açıklama', description);
  const html = buildPortalEmailHTML({
    kicker: 'Yetkili onayı bekleniyor',
    heading,
    greeting: mailSayinGreeting(recipientName),
    bodyHtml: `<p style="margin:0;">${mailStrong(
      heading
    )} başlıklı birim tedarik talebi size iletildi. Teklif toplanmadan önce onayınız bekleniyor; talebi incelemek ve karar vermek için aşağıdaki bağlantıyı kullanabilirsiniz.</p>`,
    extraHtml: `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0">${mailMetaRows([
                ['Talep', escapeHtml(heading)],
                ['Gönderen', `${escapeHtml(requesterName || '—')} (${escapeHtml(requesterEmail || '')})`],
                requesterUnit ? ['Birim', escapeHtml(requesterUnit)] : null,
              ])}</table>
              ${note.html}
            </td>
          </tr>`,
    ctaLabel: 'Talebi incele',
    ctaUrl: link,
    portalUrl: getFrontendBaseUrl(),
  });
  return {
    subject: mailSubject('Yeni birim talebi', heading),
    text: `${requesterName || ''} (${requesterEmail || ''}) yeni bir birim tedarik talebi iletti: "${heading}". Teklif toplanmadan önce onayınız bekleniyor.\n${link || ''}`,
    html,
  };
};

export const sendDepartmentRequestMail = async (to, payload = {}) => {
  const mail = to ? buildDepartmentRequestMail(payload) : null;
  if (!mail) return false;
  const result = await dispatchMail(
    { to, ...mail, teamCc: payload.teamCc, teamCcExclude: payload.teamCcExclude },
    { channel: MAIL_CHANNEL.DEPARTMENT },
  );
  return !result.skipped;
};

/** Mahmut onaylayıp “teklif toplayın” deyince personele. */
export const buildInternalRequestAssignedMail = ({
  title,
  assignedByName,
  requesterName,
  requesterUnit,
  reviewNote,
  link,
  recipientName,
} = {}) => {
  const heading = title || 'Birim talebi';
  const actor = assignedByName || 'Satın Alma Birimi Yetkilisi';
  const note = mailNoteBlock('Yetkili notu', reviewNote);
  const html = buildPortalEmailHTML({
    kicker: 'Teklif toplayın',
    heading,
    greeting: mailSayinGreeting(recipientName),
    bodyHtml: `<p style="margin:0;">${mailStrong(actor)}, ${mailStrong(
      heading
    )} başlıklı birim talebini onayladı ve size atadı. Tedarikçilerden teklif toplayabilirsiniz.</p>`,
    extraHtml: `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0">${mailMetaRows([
                ['Talep', escapeHtml(heading)],
                ['Onaylayan', escapeHtml(actor)],
                requesterName ? ['Talep eden', escapeHtml(requesterName)] : null,
                requesterUnit ? ['Birim', escapeHtml(requesterUnit)] : null,
              ])}</table>
              ${note.html}
            </td>
          </tr>`,
    ctaLabel: 'Talebi aç',
    ctaUrl: link,
    portalUrl: getFrontendBaseUrl(),
  });
  return {
    subject: mailSubject('Teklif toplayın', heading),
    text: `${actor}, "${heading}" birim talebini onayladı. Tedarikçilerden teklif toplayabilirsiniz.\n${link || ''}`,
    html,
  };
};

export const sendInternalRequestAssignedMail = async (to, payload = {}) => {
  const mail = to ? buildInternalRequestAssignedMail(payload) : null;
  if (!mail) return false;
  const result = await dispatchMail(
    { to, ...mail, teamCc: payload.teamCc, teamCcExclude: payload.teamCcExclude },
    { channel: MAIL_CHANNEL.DEPARTMENT },
  );
  return !result.skipped;
};

/** Talebi açan kişiye durum bildirimi — birim talebi kanalı. */
const REQUESTER_MAIL_COPY = {
  SUBMITTED: {
    kicker: 'Birim tedarik talebi',
    heading: 'Talebiniz iletildi',
    body: (t) =>
      `${mailStrong(t)} başlıklı talebiniz Satın Alma Birimi Yetkilisine iletildi. Karar verildiğinde e-posta ile bilgilendirileceksiniz.`,
    subject: 'Talebiniz iletildi',
  },
  APPROVED: {
    kicker: 'Birim tedarik talebi',
    heading: 'Talebiniz onaylandı',
    body: (t) =>
      `${mailStrong(t)} başlıklı talebiniz onaylandı. Satın alma personeli tedarikçilerden teklif toplayacak; süreci portaldan izleyebilirsiniz.`,
    subject: 'Talebiniz onaylandı',
  },
  REJECTED: {
    kicker: 'Birim tedarik talebi',
    heading: 'Talebiniz reddedildi',
    body: (t) =>
      `${mailStrong(t)} başlıklı talebiniz satın alma birimi tarafından reddedildi. Gerekçeyi aşağıda bulabilirsiniz.`,
    subject: 'Talebiniz reddedildi',
  },
  CONVERTED: {
    kicker: 'Birim tedarik talebi',
    heading: 'Talebiniz teklif sürecine alındı',
    body: (t) =>
      `${mailStrong(t)} başlıklı talebiniz için tedarikçilerden teklif toplanmak üzere satın alma talebi oluşturuldu.`,
    subject: 'Talebiniz teklif sürecine alındı',
  },
  SPLIT: {
    kicker: 'Birim tedarik talebi',
    heading: 'Talebinizin bir kısmı teklif sürecine alındı',
    body: (t, extra) => {
      const names = String(extra?.itemNames || '').trim();
      const rfq = String(extra?.rfqTitle || '').trim();
      const which = names ? `${mailStrong(names)} kalemleri` : 'seçilen kalemler';
      const into = rfq ? ` «${mailStrong(rfq)}» adlı tedarik talebine` : ' ayrı bir tedarik talebine';
      return `${mailStrong(t)} talebinizden ${which}${into} alındı. Kalan kalemler ayrıca işlenecek; ayrımı talebinizden görebilirsiniz.`;
    },
    subject: 'Talebinizin bir kısmı teklif sürecine alındı',
  },
};

export const buildRequesterStatusMail = ({
  kind,
  title,
  requesterUnit,
  actorName,
  actorLabel,
  note,
  itemNames,
  rfqTitle,
  link,
  recipientName,
} = {}) => {
  const copy = REQUESTER_MAIL_COPY[kind];
  if (!copy) return null;
  const metaRows = [
    ['Talep', escapeHtml(title || 'Birim talebi')],
    requesterUnit ? ['Birim', escapeHtml(requesterUnit)] : null,
    actorName ? [escapeHtml(actorLabel || 'İşlemi yapan'), escapeHtml(actorName)] : null,
  ]
    .filter(Boolean)
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:8px 0;font-size:12px;color:#64748b;width:120px;vertical-align:top;">${k}</td>
          <td style="padding:8px 0;font-size:14px;color:#1e293b;font-weight:600;">${v}</td>
        </tr>`,
    )
    .join('');
  const plainNote = note ? htmlToPlainText(note) || String(note).trim() : '';
  const noteBlock = plainNote
    ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9;">
        <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;">Satın alma notu</div>
        <div style="font-size:13px;color:#334155;margin-top:6px;line-height:1.65;white-space:pre-wrap;">${escapeHtml(
          plainNote,
        )}</div>
      </div>`
    : '';

  const html = buildPortalEmailHTML({
    kicker: copy.kicker,
    heading: copy.heading,
    greeting: mailSayinGreeting(recipientName),
    bodyHtml: `<p style="margin:0;">${copy.body(title || 'Birim talebi', { itemNames, rfqTitle })}</p>`,
    extraHtml: `<tr>
            <td style="padding:20px 28px;background:#f8fafc;border-bottom:1px solid #f1f5f9;">
              <table width="100%" cellpadding="0" cellspacing="0">${metaRows}</table>
              ${noteBlock}
            </td>
          </tr>`,
    ctaLabel: 'Talebi görüntüle',
    ctaUrl: link,
    portalUrl: getFrontendBaseUrl(),
  });
  return {
    subject: mailSubject(copy.subject, title || 'Tedarik'),
    text: `${copy.heading}: "${title}".${plainNote ? `\nNot: ${plainNote}` : ''}\n${link || ''}`,
    html,
  };
};

export const sendRequesterStatusMail = async (to, payload = {}) => {
  const mail = to ? buildRequesterStatusMail(payload) : null;
  if (!mail) return false;
  const result = await dispatchMail({ to, ...mail }, { channel: MAIL_CHANNEL.DEPARTMENT });
  return !result.skipped;
};

export const sendNewChatMail = async (to, { title, link, greeting, recipientName }) => {
  if (!to) return;
  const html = buildPortalEmailHTML({
    kicker: 'Talep yazışması',
    heading: 'Yeni mesajınız var',
    greeting: greeting || mailSayinGreeting(recipientName),
    bodyHtml: `<p style="margin:0;">${mailStrong(
      title || 'Tedarik talebi'
    )} isimli tedarik talebi hakkında yeni bir mesajınız var; görüntülemek için portala girin.</p>`,
    ctaLabel: 'Yazışmayı aç',
    ctaUrl: link,
    portalUrl: getFrontendBaseUrl(),
  });
  const result = await dispatchMail(
    {
      to,
      subject: mailSubject('Yeni mesajınız var', title),
      html,
    },
    { channel: MAIL_CHANNEL.CHAT },
  );
  return !result.skipped;
};
