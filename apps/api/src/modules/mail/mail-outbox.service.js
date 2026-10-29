import { prisma } from '../../lib/prisma.js';
import { MAIL_CHANNEL } from './mail-settings.service.js';

export const MAIL_OUTBOX_CHANNELS = {
  ...MAIL_CHANNEL,
  OTP: 'otp',
  SMTP_TEST: 'smtp_test',
  SYSTEM: 'system',
};

export const CHANNEL_LABELS = {
  [MAIL_OUTBOX_CHANNELS.VENDOR_QUOTE]: 'Tedarikçi teklifi',
  [MAIL_OUTBOX_CHANNELS.VENDOR_APPROVED]: 'Tedarikçi onayı',
  sms: 'SMS',
  [MAIL_OUTBOX_CHANNELS.QUOTE_RECEIVED]: 'Teklif bildirimi',
  [MAIL_OUTBOX_CHANNELS.APPROVAL]: 'Onay',
  [MAIL_OUTBOX_CHANNELS.OVER_LIMIT]: 'Limit aşımı',
  [MAIL_OUTBOX_CHANNELS.WAREHOUSE]: 'Depo teslim',
  [MAIL_OUTBOX_CHANNELS.DEPARTMENT]: 'Birim talebi',
  [MAIL_OUTBOX_CHANNELS.CHAT]: 'Yazışma',
  [MAIL_OUTBOX_CHANNELS.OTP]: 'OTP',
  [MAIL_OUTBOX_CHANNELS.SMTP_TEST]: 'SMTP test',
  [MAIL_OUTBOX_CHANNELS.SYSTEM]: 'Sistem',
};

export const STATUS_LABELS = {
  SENT: 'Gönderildi',
  SKIPPED: 'Atlandı',
  FAILED: 'Hata',
  PREVIEW: 'Önizleme',
};

const listSelect = {
  id: true,
  channel: true,
  status: true,
  skipReason: true,
  to: true,
  cc: true,
  subject: true,
  plainSnippet: true,
  messageId: true,
  errorMessage: true,
  createdAt: true,
};

export const listMailOutbox = async ({ status, channel, q, page = 1, pageSize = 40 } = {}) => {
  const take = Math.min(Math.max(Number(pageSize) || 40, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = {};
  if (status && ['SENT', 'SKIPPED', 'FAILED', 'PREVIEW'].includes(String(status))) {
    where.status = String(status);
  }
  if (channel && String(channel).trim()) {
    where.channel = String(channel).trim();
  }
  const query = String(q || '').trim();
  if (query) {
    where.OR = [
      { to: { contains: query, mode: 'insensitive' } },
      { cc: { contains: query, mode: 'insensitive' } },
      { subject: { contains: query, mode: 'insensitive' } },
      { plainSnippet: { contains: query, mode: 'insensitive' } },
    ];
  }

  const [total, items, statusGroups, channelGroups] = await Promise.all([
    prisma.mailOutbox.count({ where }),
    prisma.mailOutbox.findMany({
      where,
      select: listSelect,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.mailOutbox.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
    prisma.mailOutbox.groupBy({
      by: ['channel'],
      _count: { _all: true },
    }),
  ]);

  const counts = { all: 0, SENT: 0, SKIPPED: 0, FAILED: 0, PREVIEW: 0 };
  for (const g of statusGroups) {
    counts[g.status] = g._count._all;
    counts.all += g._count._all;
  }

  const channelCounts = {};
  for (const g of channelGroups) {
    const key = g.channel || 'system';
    channelCounts[key] = g._count._all;
  }

  return {
    items,
    total,
    page: Math.max(Number(page) || 1, 1),
    pageSize: take,
    counts,
    channelCounts,
    channelLabels: CHANNEL_LABELS,
  };
};

export const getMailOutboxById = async (id) => {
  const row = await prisma.mailOutbox.findUnique({ where: { id } });
  if (!row) return null;
  return {
    ...row,
    channelLabel: CHANNEL_LABELS[row.channel] || row.channel || 'Sistem',
  };
};

export const deleteMailOutboxById = async (id) => {
  try {
    await prisma.mailOutbox.delete({ where: { id } });
    return true;
  } catch (e) {
    if (e?.code === 'P2025') return false;
    throw e;
  }
};

export const deleteMailOutboxMany = async (ids = []) => {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(String).filter(Boolean))];
  if (!list.length) return { count: 0 };
  const result = await prisma.mailOutbox.deleteMany({ where: { id: { in: list } } });
  return { count: result.count };
};

export const clearPreviewMailOutbox = async () => {
  const result = await prisma.mailOutbox.deleteMany({
    where: {
      OR: [{ status: 'PREVIEW' }, { skipReason: 'preview_only' }],
    },
  });
  return { count: result.count };
};

export const seedPreviews = async ({ viewerEmail } = {}) => {
  const { seedMailTemplatePreviews } = await import('./mail.service.js');
  return seedMailTemplatePreviews({ viewerEmail });
};
