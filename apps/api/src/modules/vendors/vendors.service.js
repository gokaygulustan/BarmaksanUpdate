import { prisma } from '../../lib/prisma.js';
import { findVendorActorOverlap, formatOverlapDetail } from '../../lib/identityMatch.js';
import { recordAudit } from '../../lib/audit.js';
import { PROCUREMENT_MODULES, seesAllModulePriceHistory } from '../../lib/modules.js';

const flagVendorOverlap = async (vendor, actor = null) => {
  const internalUsers = await prisma.user.findMany({
    where: { isActive: true, role: { in: ['ADMIN', 'PURCHASING'] } },
    select: { id: true, email: true, phone: true, name: true },
  });
  const hits = findVendorActorOverlap(vendor, actor, internalUsers);
  const flagged = hits.length > 0;
  if (vendor.id) {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { flaggedInternalOverlap: flagged },
    });
  }
  if (flagged) {
    await recordAudit({
      actorUserId: actor?.id || null,
      action: 'VENDOR_INTERNAL_CONTACT_OVERLAP',
      severity: 'ALERT',
      vendorId: vendor.id,
      payload: {
        vendorName: vendor.name,
        hits: hits.map((h) => ({
          type: h.type,
          userId: h.userId,
          userName: h.userName,
          email: h.email || null,
          phone: h.phone || null,
          vendorContactName: h.vendorContactName || null,
        })),
      },
      notifyMessage: `Tedarikçi "${vendor.name}" iletişim bilgisi şirket içi kullanıcıyla eşleşiyor. Çakışma: ${formatOverlapDetail(hits)}.`,
      notifyLink: '/vendors',
    });
  }
  return { ...vendor, flaggedInternalOverlap: flagged };
};

const vendorInclude = {
  user: { select: { id: true, name: true, email: true, moduleId: true } },
  contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
};

/** Etiketleri kırp, boşları at, büyük/küçük harf tekrarını temizle. */
const normalizeCategories = (values) => {
  if (!Array.isArray(values)) return undefined;
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const label = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label) continue;
    const key = label.toLocaleUpperCase('tr-TR');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
};

const trimOrNull = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : null;
};

/**
 * Gönderilen listeyi tedarikçinin yetkili kişileriyle eşitler:
 * id'si olan güncellenir, olmayan eklenir, listede olmayan silinir.
 * İlk satır birincil kişi sayılır.
 */
const syncContacts = async (vendorId, contacts) => {
  const rows = contacts
    .map((contact) => ({
      id: contact.id,
      name: trimOrNull(contact.name),
      title: trimOrNull(contact.title),
      email: trimOrNull(contact.email)?.toLowerCase() ?? null,
      phone: trimOrNull(contact.phone),
      notes: trimOrNull(contact.notes),
    }))
    .filter((contact) => contact.name || contact.email || contact.phone);

  const existing = await prisma.vendorContact.findMany({
    where: { vendorId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((row) => row.id));
  const keepIds = new Set(rows.map((row) => row.id).filter((id) => id && existingIds.has(id)));

  const removable = existing.filter((row) => !keepIds.has(row.id)).map((row) => row.id);
  if (removable.length) {
    await prisma.vendorContact.deleteMany({ where: { id: { in: removable } } });
  }

  for (const [index, row] of rows.entries()) {
    const data = {
      name: row.name,
      title: row.title,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      isPrimary: index === 0,
    };
    if (row.id && existingIds.has(row.id)) {
      await prisma.vendorContact.update({ where: { id: row.id }, data });
    } else {
      await prisma.vendorContact.create({ data: { ...data, vendorId } });
    }
  }
};

export const getAll = async (actorUser = null) => {
  if (!actorUser || actorUser.role === 'ADMIN') {
    return prisma.vendor.findMany({
      include: vendorInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  if (actorUser.role === 'SUPPLIER') {
    return prisma.vendor.findMany({
      where: { userId: actorUser.id },
      include: vendorInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // PURCHASING role: strictly filter vendors by user's active moduleId
  const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
  return prisma.vendor.findMany({
    where: {
      OR: [
        { moduleId: userModuleId },
        { user: { moduleId: userModuleId } },
      ],
    },
    include: vendorInclude,
    orderBy: { createdAt: 'desc' },
  });
};

export const getById = async (id, actorUser = null) => {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: vendorInclude,
  });
  if (!vendor) {
    const err = new Error('Tedarikçi bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (actorUser && actorUser.role !== 'ADMIN' && actorUser.role !== 'SUPPLIER') {
    const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
    if (vendor.moduleId && vendor.moduleId !== userModuleId && vendor.user?.moduleId !== userModuleId) {
      const err = new Error('Bu tedarikçiyi görüntüleme yetkiniz bulunmamaktadır (Farklı Modül).');
      err.statusCode = 403;
      throw err;
    }
  }

  return vendor;
};

const VENDOR_MODULES = PROCUREMENT_MODULES;

export const create = async (data, actorUser = null) => {
  // ADMIN modülü seçebilir; seçmezse satın alma tarafına yazılır (üretim listesi kirlenmesin).
  // Diğer kullanıcılar her zaman kendi modülüne yazar.
  const actorModuleId = VENDOR_MODULES.includes(actorUser?.moduleId)
    ? actorUser.moduleId
    : 'SATIN_ALMA';
  const targetModuleId =
    actorUser?.role === 'ADMIN' ? data.moduleId || actorModuleId : actorModuleId;
  const { contacts, ...rest } = data;
  const categories = normalizeCategories(rest.categories);
  const vendor = await prisma.vendor.create({
    data: {
      ...rest,
      ...(categories ? { categories } : {}),
      moduleId: targetModuleId,
    },
  });
  if (Array.isArray(contacts)) await syncContacts(vendor.id, contacts);
  const flagged = await flagVendorOverlap(vendor, actorUser);
  return { ...flagged, contacts: await prisma.vendorContact.findMany({
    where: { vendorId: vendor.id },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  }) };
};

export const update = async (id, data, actorUser = null) => {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Tedarikçi bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (actorUser && actorUser.role !== 'ADMIN' && actorUser.role !== 'SUPPLIER') {
    const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
    if (existing.moduleId && existing.moduleId !== userModuleId) {
      const err = new Error('Bu tedarikçiyi düzenleme yetkiniz yok (Farklı Modül).');
      err.statusCode = 403;
      throw err;
    }
  }

  const { contacts, moduleId, ...rest } = data;
  const categories = normalizeCategories(rest.categories);
  // Modül taşımak yalnızca ADMIN'e açık; aksi halde tedarikçi bulunduğu modülde kalır.
  const moduleChange = moduleId && actorUser?.role === 'ADMIN' ? { moduleId } : {};
  const vendor = await prisma.vendor.update({
    where: { id },
    data: { ...rest, ...moduleChange, ...(categories ? { categories } : {}) },
  });
  if (Array.isArray(contacts)) await syncContacts(vendor.id, contacts);
  const flagged = await flagVendorOverlap(vendor, actorUser);
  return { ...flagged, contacts: await prisma.vendorContact.findMany({
    where: { vendorId: vendor.id },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  }) };
};

export const remove = async (id, actorUser = null) => {
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error('Tedarikçi bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (actorUser && actorUser.role !== 'ADMIN') {
    const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
    if (existing.moduleId && existing.moduleId !== userModuleId) {
      const err = new Error('Bu tedarikçiyi silme yetkiniz yok (Farklı Modül).');
      err.statusCode = 403;
      throw err;
    }
  }

  return prisma.vendor.delete({ where: { id } });
};

export const getPurchaseHistory = async (vendorId = null, actorUser = null) => {
  const whereAssignment = {};
  if (vendorId) {
    whereAssignment.vendorId = vendorId;
  }
  if (actorUser && actorUser.role !== 'ADMIN') {
    const userModuleId = actorUser.moduleId || 'URETIM_PLANLAMA';
    whereAssignment.request = seesAllModulePriceHistory(actorUser)
      ? { moduleId: { in: PROCUREMENT_MODULES } }
      : { moduleId: userModuleId };
  }

  const assignments = await prisma.requestVendorAssignment.findMany({
    where: whereAssignment,
    include: {
      vendor: { select: { id: true, name: true, contactEmail: true, contactPhone: true, moduleId: true } },
      request: {
        select: {
          id: true,
          title: true,
          status: true,
          moduleId: true,
          createdAt: true,
          items: {
            include: {
              quotes: true,
              vendorPick: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const history = [];

  for (const assign of assignments) {
    const { request, vendor, isShippingIncluded, isVatIncluded, vatRate, hasMaturity, maturityDays, overallDiscountRate } = assign;
    if (!request) continue;

    for (const item of request.items) {
      const quote = item.quotes.find((q) => q.vendorId === vendor.id);
      if (!quote) continue;

      const isPicked = item.vendorPick?.chosenVendorId === vendor.id;

      history.push({
        assignmentId: assign.id,
        requestId: request.id,
        requestTitle: request.title,
        requestStatus: request.status,
        requestModuleId: request.moduleId,
        requestCreatedAt: request.createdAt,
        vendorId: vendor.id,
        vendorName: vendor.name,
        itemId: item.id,
        productName: item.productName,
        category: item.category || 'Genel',
        unit: item.unit,
        quantity: item.quantity,
        quotedPrice: quote.price,
        currency: quote.currency,
        discountRate: quote.discountRate || 0,
        overallDiscountRate: overallDiscountRate || 0,
        isShippingIncluded: isShippingIncluded ?? true,
        isVatIncluded: isVatIncluded ?? true,
        vatRate: vatRate ?? null,
        hasMaturity: hasMaturity ?? false,
        maturityDays: maturityDays ?? null,
        isPicked,
        quoteCreatedAt: quote.createdAt,
      });
    }
  }

  return history;
};
