import { prisma } from './prisma.js';
import { filterNotifyUserIds } from './mailSink.js';

const notifyExecutives = async (message, link) => {
  const executives = await prisma.user.findMany({
    where: { isActive: true, isExecutive: true },
    select: { id: true },
  });
  const ids = await filterNotifyUserIds(prisma, executives.map((u) => u.id));
  if (!ids.length) return;
  await prisma.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      message,
      link: link || null,
    })),
  });
};

/** Birim talepleri satın alma birim sorumlusuna düşer (Kerem’e değil). */
export const notifySatinAlmaManagers = async (message, link) => {
  const managers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: 'PURCHASING',
      moduleId: 'SATIN_ALMA',
      subRole: 'MANAGER',
    },
    select: { id: true, name: true, email: true },
  });
  if (!managers.length) return [];
  await prisma.notification.createMany({
    data: managers.map((u) => ({
      userId: u.id,
      message,
      link: link || null,
    })),
  });
  return managers;
};

const quoted = (value) => {
  const t = String(value || '').trim();
  return t ? `"${t}"` : null;
};

/** notifyMessage yoksa ham action kodu yerine okunabilir Türkçe metin üretir. */
const defaultAuditNotifyMessage = (action, payload) => {
  const title = quoted(payload?.title);
  const vendor = quoted(payload?.vendorName);
  const byAction = {
    PROCUREMENT_REQUEST_DELETED: title
      ? `${title} tedarikçi talebi silindi.`
      : 'Bir tedarikçi talebi silindi.',
    INTERNAL_REQUEST_DELETED: title
      ? `${title} birim talebi silindi.`
      : 'Bir birim talebi silindi.',
    STAFF_OPENED_QUOTE_PAGE: vendor
      ? `Personel, ${vendor} tedarikçi teklif sayfasını açtı.`
      : 'Personel, tedarikçi teklif sayfasını açtı.',
    QUOTE_LINK_COPY: title
      ? `${title} talebinin tedarikçi teklif bağlantısı kopyalandı.`
      : 'Tedarikçi teklif bağlantısı kopyalandı.',
    QUOTE_LINK_PREVIEW: title
      ? `${title} talebinin tedarikçi teklif bağlantısı önizlendi.`
      : 'Tedarikçi teklif bağlantısı önizlendi.',
    VENDOR_INTERNAL_CONTACT_OVERLAP: vendor
      ? `Tedarikçi ${vendor} iletişim bilgisi şirket içi kullanıcıyla eşleşiyor.`
      : 'Tedarikçi iletişim bilgisi şirket içi kullanıcıyla eşleşiyor.',
    VENDOR_NOTIFY_BLOCKED_SELF: vendor
      ? `Tedarikçi ${vendor} bildirimi şirket içi iletişim çakışması nedeniyle engellendi.`
      : 'Tedarikçi bildirimi şirket içi iletişim çakışması nedeniyle engellendi.',
  };
  if (byAction[action]) return byAction[action];
  const human = String(action || '')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .join(' ');
  return human ? `Denetim uyarısı: ${human}.` : 'Denetim uyarısı.';
};

export const recordAudit = async ({
  actorUserId = null,
  action,
  severity = 'INFO',
  payload = null,
  requestId = null,
  vendorId = null,
  internalRequestId = null,
  notify = false,
  notifyMessage = null,
  notifyLink = null,
}) => {
  const safePayload = payload && typeof payload === 'object' ? { ...payload } : payload;
  if (safePayload && typeof safePayload === 'object') {
    delete safePayload.quoteToken;
    delete safePayload.token;
    delete safePayload.password;
  }

  const event = await prisma.auditEvent.create({
    data: {
      actorUserId,
      action,
      severity,
      payload: safePayload ?? undefined,
      requestId,
      vendorId,
      internalRequestId,
    },
  });

  if (notify || severity === 'ALERT') {
    await notifyExecutives(
      notifyMessage || defaultAuditNotifyMessage(action, safePayload),
      notifyLink
    );
  }

  return event;
};
