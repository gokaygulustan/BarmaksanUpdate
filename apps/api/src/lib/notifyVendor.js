import { sendProcurementEmail, resolveVendorNotificationEmails } from '../modules/mail/mail.service.js';
import { sendVendorSms } from '../modules/sms/sms.service.js';
import { findVendorActorOverlap, formatOverlapDetail } from './identityMatch.js';
import { recordAudit } from './audit.js';
import { prisma } from './prisma.js';

const conflictError = (message) => {
  const err = new Error(message);
  err.statusCode = 409;
  return err;
};

/**
 * Tedarikçiye e-posta (+ isteğe bağlı SMS). Personel CC yok; Reply-To gönderen personel.
 * Alıcı, işlem yapan veya şirket içi kullanıcıyla çakışırsa gönderim durur.
 */
/** Yetkili kişiler yüklenmemişse tamamlar: bildirim adresleri/numaraları buradan geliyor. */
const withContacts = async (vendor) => {
  if (!vendor?.id || Array.isArray(vendor.contacts)) return vendor;
  const contacts = await prisma.vendorContact.findMany({
    where: { vendorId: vendor.id },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  return { ...vendor, contacts };
};

export const notifyVendor = async ({
  vendor: vendorInput,
  request,
  items,
  quoteToken,
  quoteShortCode = null,
  cc = [],
  actor = null,
  channels = ['email', 'sms'],
  phoneOverride = null,
  forceSms = false,
}) => {
  const vendor = await withContacts(vendorInput);
  const internalUsers = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['ADMIN', 'PURCHASING'] },
    },
    select: { id: true, email: true, phone: true, name: true },
  });

  const overlaps = findVendorActorOverlap(vendor, actor, internalUsers);
  if (overlaps.length) {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { flaggedInternalOverlap: true },
    }).catch(() => {});

    const reqTitle = request?.title ? `"${request.title}" talebinde ` : '';
    await recordAudit({
      actorUserId: actor?.id || null,
      action: 'VENDOR_NOTIFY_BLOCKED_SELF',
      severity: 'ALERT',
      vendorId: vendor.id,
      requestId: request?.id || null,
      payload: {
        vendorName: vendor.name,
        title: request?.title || null,
        overlaps: overlaps.map((h) => ({
          type: h.type,
          userId: h.userId,
          userName: h.userName,
          email: h.email || null,
          phone: h.phone || null,
          vendorContactName: h.vendorContactName || null,
        })),
      },
      notifyMessage: `${actor?.name || 'Kullanıcı'}, ${reqTitle}tedarikçi "${vendor.name}" bildirimi durduruldu. Çakışma: ${formatOverlapDetail(overlaps)}.`,
      notifyLink: request?.id ? `/procurement/${request.id}` : '/vendors',
    });

    throw conflictError(
      `“${vendor?.name || 'Tedarikçi'}” bildirimi gönderilmedi. Çakışma: ${formatOverlapDetail(overlaps)}. Tedarikçi kaydındaki iletişim bilgilerini düzeltip tekrar deneyin.`
    );
  }

  const results = { email: false, sms: false };

  let replyActor = actor;
  if (!String(replyActor?.email || '').includes('@')) {
    const fallbackId =
      replyActor?.id ||
      request?.assignedToId ||
      request?.assignedTo?.id ||
      request?.createdById ||
      request?.createdBy?.id ||
      null;
    if (fallbackId) {
      const row = await prisma.user.findUnique({
        where: { id: fallbackId },
        select: { id: true, name: true, email: true },
      });
      if (row) replyActor = { ...replyActor, ...row };
    }
  }

  if (channels.includes('email') && resolveVendorNotificationEmails(vendor).length) {
    results.email = await sendProcurementEmail({
      vendor,
      request,
      items,
      quoteToken,
      cc,
      actor: replyActor,
    });
  }

  if (channels.includes('sms')) {
    const smsResult = await sendVendorSms({
      vendor,
      request,
      quoteToken,
      quoteShortCode,
      phoneOverride,
      force: forceSms,
    });
    results.sms = Boolean(smsResult?.ok);
    results.smsPhone = smsResult?.phone || null;
    results.smsReason = smsResult?.reason || null;
  }

  await recordAudit({
    actorUserId: actor?.id || null,
    action: 'VENDOR_NOTIFY_SENT',
    severity: 'INFO',
    vendorId: vendor.id,
    requestId: request?.id || null,
    payload: { channels: results, vendorName: vendor.name },
  });

  return results;
};
