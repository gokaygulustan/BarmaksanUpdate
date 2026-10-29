import { prisma } from '../../lib/prisma.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { decodeMultipartOriginalName } from '../../utils/multipartFilename.js';
import { getFrontendBaseUrl } from '../../config/frontendUrl.js';
import { convertToTRY, getRatesToTRY, resolveRatesForRequest, normalizeRatesToTRY } from '../currency/currency.service.js';
import { stripQuoteTokens, scrubVendorActivityLogs, presentProcurementForViewer, canCreateStandaloneRfq } from '../../lib/access.js';
import { notifyVendor } from '../../lib/notifyVendor.js';
import { recordAudit } from '../../lib/audit.js';
import { resolveQuoteLetterhead } from '../../lib/quoteLetterhead.js';
import { generateShortCode } from '../../lib/quoteShortCode.js';
import {
  forbid,
  presentProcurementForVendor,
  scrubPublicCreator,
  moneyCents,
  centsToTry,
} from '../../lib/procurementViewer.js';
import { sanitizeRichHtml } from '../../lib/sanitizeHtml.js';
import { mailSubject, escapeHtml, htmlToPlainText, mailStrong } from '../mail/mail-layout.js';
import { MAIL_CHANNEL } from '../mail/mail-settings.service.js';
import { appendDecisionBasis, assessPriorExecutiveApproval } from '../../lib/decisionBasis.js';
import { filterNotifyUserIds, isIsolatedMailbox, mailSinkActive } from '../../lib/mailSink.js';
import {
  MARKET_CHANNELS,
  MARKET_EDITABLE_STATUSES,
  attachMarketQuotesForDisplay,
  isMarketColumnId,
  isMarketQuoteLike,
  marketChannelLabel,
  marketColumnId,
  marketColumnName,
  parseHttpUrl,
  parseMarketSourceId,
  presentChosenColumnId,
} from '../../lib/marketOffer.js';
import {
  MODULE,
  isYedekParcaModule,
  moduleLabel,
  requiresExecutiveForAnyApproval,
  usesExecutiveDecisionInvite,
  usesPurchasingQuoteForm,
} from '../../lib/modules.js';
import { resolveRequestProjectId } from '../projects/projects.service.js';
import {
  isHandedToSatinAlma,
  purchasingModuleOf,
  usesSatinAlmaApprovalChain,
} from '../../lib/purchasingResponsibility.js';

const generateToken = () => crypto.randomBytes(32).toString('hex');

/** Satın alma birimi diğer hatların talebini okuyabilir. Yazma yine kaynak moduleId ile sınırlıdır. */
const isCentralProcurementReader = (viewer) =>
  viewer?.role === 'PURCHASING' && (viewer.moduleId || '') === MODULE.SATIN_ALMA;

const assertProcurementReadable = (viewer, request) => {
  if (!viewer || viewer.role === 'ADMIN') return;
  const vModule = viewer.moduleId || MODULE.URETIM;
  if (request?.moduleId && request.moduleId !== vModule && !isCentralProcurementReader(viewer)) {
    throw forbid('Bu talebe erişim yetkiniz yok (Farklı Modül).', 403);
  }
};

/** Satın alma yazması, sorumluluğu taşıyan hatta aittir. Kaynak moduleId tek başına yazma açmaz. */
const assertSameModuleWriter = (request, actor) => {
  if (!actor) throw forbid('Bu işlem için yetkiniz yok.', 403);
  if (actor.role === 'ADMIN') return;
  if (actor.role === 'PURCHASING' && (actor.moduleId || '') === purchasingModuleOf(request)) return;
  throw forbid('Bu talebe erişim yetkiniz yok (Farklı Modül).', 403);
};

const shopRelationInclude = {
  shopDepartment: { select: { id: true, name: true, collarType: true, isActive: true } },
  shopWorker: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      departmentId: true,
      isActive: true,
    },
  },
  project: { select: { id: true, code: true, name: true, isDefault: true, isActive: true } },
};

/** Yetkilinin açtığı SATIN_ALMA RFQ da birim tedarik panosunda dursun. */
const linkSatinAlmaRfqToInbox = async (requestId) => {
  const pr = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      shopDepartment: { select: { name: true } },
    },
  });
  if (!pr || pr.moduleId !== 'SATIN_ALMA') return null;
  if (pr.internalRequestId) return { id: pr.internalRequestId };
  const created = await prisma.internalRequest.create({
    data: {
      title: pr.title,
      description: pr.description,
      requesterUnit: pr.shopDepartment?.name || null,
      shopDepartmentId: pr.shopDepartmentId,
      shopWorkerId: pr.shopWorkerId,
      neededBy: pr.neededBy,
      status: 'CONVERTED',
      moduleId: 'SATIN_ALMA',
      createdById: pr.createdById,
      items: {
        create: (pr.items || []).map((item, index) => ({
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit || 'Adet',
          notes: item.notes,
          stockCode: item.stockCode,
          sortOrder: item.sortOrder ?? index,
          procurementRequestId: pr.id,
        })),
      },
    },
    select: { id: true },
  });
  await prisma.procurementRequest.update({
    where: { id: pr.id },
    data: { internalRequestId: created.id },
  });
  return created;
};

/** Talep birimi + isteğe bağlı mavi yaka usta alanlarını doğrular. */
const resolveShopFields = async (data, { existing = null } = {}) => {
  const hasDept = Object.prototype.hasOwnProperty.call(data, 'shopDepartmentId');
  const hasWorker = Object.prototype.hasOwnProperty.call(data, 'shopWorkerId');
  if (!hasDept && !hasWorker) return {};

  let shopDepartmentId = hasDept ? data.shopDepartmentId : existing?.shopDepartmentId ?? null;
  let shopWorkerId = hasWorker ? data.shopWorkerId : existing?.shopWorkerId ?? null;

  if (shopDepartmentId === '') shopDepartmentId = null;
  if (shopWorkerId === '') shopWorkerId = null;

  let deptRow = null;
  if (shopDepartmentId) {
    deptRow = await prisma.department.findUnique({ where: { id: shopDepartmentId } });
    if (!deptRow) throw forbid('Birim geçersiz.', 400);
    if (!deptRow.isActive && shopDepartmentId !== existing?.shopDepartmentId) {
      throw forbid('Seçilen birim pasif.', 400);
    }
  }

  if (shopWorkerId) {
    const worker = await prisma.orgWorker.findUnique({
      where: { id: shopWorkerId },
      include: { department: { select: { id: true, collarType: true, isActive: true } } },
    });
    if (!worker) throw forbid('Usta/çalışan bulunamadı.', 400);
    if (!worker.isActive && shopWorkerId !== existing?.shopWorkerId) {
      throw forbid('Seçilen usta/çalışan pasif.', 400);
    }
    if (worker.department?.collarType !== 'BLUE_COLLAR') {
      throw forbid('Usta/çalışan yalnızca mavi yaka birime bağlanabilir.', 400);
    }
    if (shopDepartmentId && worker.departmentId !== shopDepartmentId) {
      throw forbid('Usta/çalışan seçilen birime bağlı değil.', 400);
    }
    if (!shopDepartmentId) {
      shopDepartmentId = worker.departmentId;
      deptRow = worker.department;
    }
  }

  if (shopWorkerId && deptRow?.collarType === 'WHITE_COLLAR') {
    throw forbid('Beyaz yaka birimde usta/çalışan seçilemez.', 400);
  }

  const out = {};
  if (hasDept || hasWorker) out.shopDepartmentId = shopDepartmentId;
  if (hasWorker) out.shopWorkerId = shopWorkerId;
  if (hasDept && !shopDepartmentId) out.shopWorkerId = null;
  if (deptRow?.collarType === 'WHITE_COLLAR') out.shopWorkerId = null;
  return out;
};

const newAssignmentTokenFields = (deadline) => ({
  quoteToken: generateToken(),
  quoteShortCode: generateShortCode(),
  tokenExpires: deadline,
});

/** Tedarikçi (quote token / SUPPLIER) fatura ve başkasının eklerini görmez. */
const isVendorVisibleAttachment = (att, vendorId) => {
  if (!att || att.kind === 'INVOICE') return false;
  if (att.marketSourceId) return false;
  if (att.vendorId && att.vendorId !== vendorId) return false;
  return true;
};

const MARKET_SOURCE_INCLUDE = {
  quotes: true,
  attachments: {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      itemId: true,
    },
  },
  createdBy: { select: { id: true, name: true } },
};

const DEFAULT_QUOTE_COLLECT_DAYS = 15;

const resolveQuoteDeadline = ({ deadline, quoteCollectDays } = {}) => {
  if (deadline) {
    const d = new Date(deadline);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const raw = Number(quoteCollectDays);
  const days = Number.isFinite(raw) ? Math.min(120, Math.max(1, Math.round(raw))) : DEFAULT_QUOTE_COLLECT_DAYS;
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
};


/** Kalemler include bloğu — sıralama Prisma orderBy yerine DB/raw SQL + bellek içi yapılır (eski client uyumu). */
const requestItemsQuery = (include = {}) => ({ include });

const snSortKey = (sn) => {
  const s = String(sn || '').trim();
  if (!s) return 2147483647;
  const parts = s.split(/[.,\-]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return 2147483647;
  const a = parseInt(parts[0], 10) || 0;
  const b = parseInt(parts[1] || '0', 10) || 0;
  const c = parseInt(parts[2] || '0', 10) || 0;
  return a * 1e8 + b * 1e4 + c;
};

const compareItemsFallback = (a, b) => {
  const sk = snSortKey(a.serialNumber) - snSortKey(b.serialNumber);
  if (sk !== 0) return sk;
  const ac = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bc = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (ac !== bc) return ac - bc;
  return String(a.id || '').localeCompare(String(b.id || ''));
};

const sortItemsInMemory = (items) => {
  if (!items?.length) return [];
  return [...items].sort((a, b) => {
    const ao = a.sortOrder;
    const bo = b.sortOrder;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return compareItemsFallback(a, b);
  });
};

const loadItemSortOrderMap = async (requestId, db = prisma) => {
  try {
    const rows = await db.$queryRaw`
      SELECT id, "sortOrder" FROM request_items WHERE "requestId" = ${requestId}
    `;
    return new Map(rows.map((r) => [r.id, Number(r.sortOrder) || 0]));
  } catch {
    return null;
  }
};

const applyDbSortOrder = async (requestId, items) => {
  if (!items?.length) return [];
  const map = await loadItemSortOrderMap(requestId);
  if (!map) return sortItemsInMemory(items);
  return sortItemsInMemory(
    items.map((i) => ({ ...i, sortOrder: map.get(i.id) ?? i.sortOrder ?? 0 }))
  );
};

const persistItemSortOrder = async (itemId, sortOrder, db = prisma) => {
  try {
    await db.$executeRaw`
      UPDATE request_items SET "sortOrder" = ${sortOrder} WHERE id = ${itemId}
    `;
  } catch (err) {
    console.warn('sortOrder kaydedilemedi (migration çalıştırıldı mı?):', err.message);
  }
};

const withSortedItems = async (request) => {
  if (!request?.items?.length) return request;
  const items = await applyDbSortOrder(request.id, request.items);
  return { ...request, items };
};

const resolveItemSortOrder = (item, fallbackIndex) => {
  if (item.sortOrder !== null && item.sortOrder !== undefined) {
    const n = Number(item.sortOrder);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return fallbackIndex;
};

const mapRequestItemRow = (item, fallbackIndex) => {
  let secondaryQty = null;
  if (item.secondaryQuantity !== null && item.secondaryQuantity !== undefined) {
    const n = Number(item.secondaryQuantity);
    secondaryQty = Number.isFinite(n) ? n : null;
  }
  const qty = Number(item.quantity);
  const row = {
    serialNumber: item.serialNumber ?? null,
    stockCode: item.stockCode ?? null,
    tonnageInfo: item.tonnageInfo ?? null,
    productName: item.productName,
    quantity: Number.isFinite(qty) ? qty : 0,
    unit: item.unit || 'Adet',
    notes: item.notes ?? null,
    category: item.category ?? null,
    secondaryQuantity: secondaryQty,
    secondaryUnit: item.secondaryUnit ?? null,
  };
  if (item.productId) {
    row.product = { connect: { id: item.productId } };
  }
  return row;
};

/** Prisma create/update sonrası sıra — transaction DIŞINDA çağrılmalı (PG abort önlenir). */
const persistItemSortOrders = async (writes) => {
  if (!writes?.length) return;
  for (const { itemId, item, index } of writes) {
    await persistItemSortOrder(itemId, resolveItemSortOrder(item, index));
  }
};

const logVendorActivity = async (requestId, vendorId, action, message) => {
  return prisma.vendorActivityLog.create({
    data: {
      requestId,
      vendorId,
      action,
      message,
    },
  });
};

const toNum = (v) => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const discFmt = (v) => {
  const n = toNum(v);
  if (n === null) return '—';
  if (Number.isInteger(n)) return `%${n}`;
  const s = n.toFixed(2).replace(/\.?0+$/, '');
  return `%${s}`;
};

const quoteWriteData = (item) => {
  const data = {
    price: item.price,
    currency: item.currency || 'TRY',
    notes: item.notes !== undefined ? item.notes : undefined,
    discountRate: item.discountRate !== undefined ? item.discountRate : undefined,
  };
  if (item.vatRate !== undefined) data.vatRate = item.vatRate;
  return data;
};

const assignmentFxOverride = (assignment) => {
  if (!assignment?.usdRateFixed) return null;
  const o = {};
  if (Number(assignment.usdRate) > 0) o.USD = Number(assignment.usdRate);
  if (Number(assignment.eurRate) > 0) o.EUR = Number(assignment.eurRate);
  if (Number(assignment.chfRate) > 0) o.CHF = Number(assignment.chfRate);
  return Object.keys(o).length ? o : null;
};

const SATIN_ALMA_VAT_RATES = new Set([1, 10, 20]);

const normalizeSatinAlmaQuoteItems = (items, moduleId) => {
  if (!usesPurchasingQuoteForm(moduleId)) return items;
  return (items || []).map((item) => {
    const v = Number(item.vatRate);
    return { ...item, vatRate: SATIN_ALMA_VAT_RATES.has(v) ? v : 20 };
  });
};

const quoteItemCurrencies = (items = []) => {
  const used = new Set();
  for (const item of items || []) {
    const c = String(item?.currency || '').toUpperCase();
    if (c === 'USD' || c === 'EUR' || c === 'CHF') used.add(c);
  }
  return used;
};

const normalizeSatinAlmaUsdTerms = (commercialTerms = {}, moduleId, items = []) => {
  if (!usesPurchasingQuoteForm(moduleId)) {
    const { usdRateFixed: _f, usdRate: _r, eurRate: _e, chfRate: _c, quoteNote: _n, ...rest } = commercialTerms;
    return rest;
  }
  const fixed = Boolean(commercialTerms.usdRateFixed);
  const usd = Number(commercialTerms.usdRate);
  const eur = Number(commercialTerms.eurRate);
  const chf = Number(commercialTerms.chfRate);
  const used = quoteItemCurrencies(items);
  if (fixed) {
    if (used.has('USD') && !(usd > 0)) {
      const err = new Error('Döviz kuru sabitlendiğinde USD kuru girilmelidir.');
      err.statusCode = 400;
      throw err;
    }
    if (used.has('EUR') && !(eur > 0)) {
      const err = new Error('Döviz kuru sabitlendiğinde EUR kuru girilmelidir.');
      err.statusCode = 400;
      throw err;
    }
    if (used.has('CHF') && !(chf > 0)) {
      const err = new Error('Döviz kuru sabitlendiğinde CHF kuru girilmelidir.');
      err.statusCode = 400;
      throw err;
    }
  }
  return {
    ...commercialTerms,
    usdRateFixed: fixed,
    usdRate: fixed && used.has('USD') && usd > 0 ? usd : null,
    eurRate: fixed && used.has('EUR') && eur > 0 ? eur : null,
    chfRate: fixed && used.has('CHF') && chf > 0 ? chf : null,
    isVatIncluded: false,
  };
};

/**
 * Önceki teklif durumu ile gönderilen payload karşılaştırılır; Tedarikçi Logları için Türkçe satırlar.
 */
const buildVendorQuoteChangeSummary = ({
  requestItems,
  submittedItems,
  vendorId,
  prevOverallDiscount,
  newOverallDiscount,
}) => {
  const lines = [];
  const byId = new Map(submittedItems.map((i) => [i.id, i]));

  for (const reqItem of requestItems) {
    const newItem = byId.get(reqItem.id);
    if (!newItem || newItem.price === null || newItem.price === undefined) continue;

    const cq = (reqItem.quotes || []).find((q) => q.vendorId === vendorId);
    const newPrice = toNum(newItem.price);
    const newCur = newItem.currency || 'TRY';

    const resolvedNewDisc = cq
      ? newItem.discountRate !== undefined
        ? toNum(newItem.discountRate)
        : toNum(cq.discountRate)
      : toNum(newItem.discountRate);

    const resolvedNewNotes = cq
      ? newItem.notes !== undefined
        ? String(newItem.notes ?? '').trim()
        : String(cq.notes ?? '').trim()
      : String(newItem.notes ?? '').trim();

    const label = reqItem.productName || 'Kalem';

    if (!cq) {
      const bits = [`birim fiyat ${newPrice} ${newCur}`];
      if (resolvedNewDisc !== null && resolvedNewDisc > 0) bits.push(`kalem isk. ${discFmt(resolvedNewDisc)}`);
      if (resolvedNewNotes) bits.push('not eklendi');
      lines.push(`${label}: yeni teklif (${bits.join(', ')})`);
      continue;
    }

    const oldPrice = toNum(cq.price);
    const oldCur = cq.currency || 'TRY';
    const oldDisc = toNum(cq.discountRate);
    const oldNotes = String(cq.notes ?? '').trim();

    const parts = [];
    if (oldPrice !== newPrice || oldCur !== newCur) {
      parts.push(`birim fiyat ${oldPrice} ${oldCur} → ${newPrice} ${newCur}`);
    }
    const dOld = oldDisc;
    const dNew = resolvedNewDisc;
    if ((dOld ?? -99999) !== (dNew ?? -99999)) {
      parts.push(`kalem isk. ${discFmt(dOld)} → ${discFmt(dNew)}`);
    }
    if (oldNotes !== resolvedNewNotes) {
      if (resolvedNewNotes) parts.push('tedarikçi notu güncellendi');
      else parts.push('tedarikçi notu kaldırıldı');
    }

    if (parts.length > 0) {
      lines.push(`${label}: ${parts.join('; ')}`);
    }
  }

  if (newOverallDiscount !== undefined) {
    const p = toNum(prevOverallDiscount) ?? 0;
    const n = toNum(newOverallDiscount) ?? 0;
    if (p !== n) {
      lines.push(`Genel iskonto: ${discFmt(p)} → ${discFmt(n)}`);
    }
  }

  return lines;
};

const sameQuoteNum = (a, b) => {
  const x = toNum(a);
  const y = toNum(b);
  if (x === null && y === null) return true;
  if (x === null || y === null) return false;
  return x === y;
};

/** İlk teklifte tüm kalemler; güncellemede yalnız fiyat/iskonto değişenler (eski + yeni). */
const buildQuotedItemsForEmail = ({
  requestItems,
  submittedItems,
  vendorId,
  isUpdate,
}) => {
  const byId = new Map((submittedItems || []).map((i) => [i.id, i]));
  const rows = [];

  for (const reqItem of requestItems || []) {
    const submitted = byId.get(reqItem.id);
    const base = {
      productName: reqItem.productName,
      notes: reqItem.notes || null,
      quantity: reqItem.quantity,
      unit: reqItem.unit || 'Adet',
      secondaryQuantity: reqItem.secondaryQuantity || null,
      secondaryUnit: reqItem.secondaryUnit || null,
    };

    if (!isUpdate) {
      rows.push({
        ...base,
        price: submitted?.price ?? null,
        currency: submitted?.currency || 'TRY',
        quoteNotes: submitted?.notes || null,
      });
      continue;
    }

    if (!submitted || submitted.price === null || submitted.price === undefined || submitted.price === '') {
      continue;
    }
    const newPrice = toNum(submitted.price);
    if (newPrice === null) continue;

    const cq = (reqItem.quotes || []).find((q) => q.vendorId === vendorId);
    const newCur = submitted.currency || 'TRY';
    const newDisc =
      submitted.discountRate !== undefined ? toNum(submitted.discountRate) : toNum(cq?.discountRate);
    const newNotes =
      submitted.notes !== undefined ? String(submitted.notes ?? '').trim() : String(cq?.notes ?? '').trim();

    if (!cq || cq.price == null) {
      rows.push({
        ...base,
        price: newPrice,
        currency: newCur,
        discountRate: newDisc,
        oldPrice: null,
        oldCurrency: null,
        oldDiscountRate: null,
        quoteNotes: newNotes || null,
      });
      continue;
    }

    const oldPrice = toNum(cq.price);
    const oldCur = cq.currency || 'TRY';
    const oldDisc = toNum(cq.discountRate);
    const priceChanged = !sameQuoteNum(oldPrice, newPrice) || oldCur !== newCur;
    const discChanged = !sameQuoteNum(oldDisc ?? 0, newDisc ?? 0);
    if (!priceChanged && !discChanged) continue;

    rows.push({
      ...base,
      price: newPrice,
      currency: newCur,
      discountRate: newDisc,
      oldPrice,
      oldCurrency: oldCur,
      oldDiscountRate: oldDisc,
      quoteNotes: newNotes || null,
    });
  }

  return rows;
};

const overallDiscountChangeForEmail = (prevOverallDiscount, newOverallDiscount) => {
  if (newOverallDiscount === undefined) return null;
  const oldVal = toNum(prevOverallDiscount) ?? 0;
  const newVal = toNum(newOverallDiscount) ?? 0;
  if (oldVal === newVal) return null;
  return { old: oldVal, new: newVal };
};

const truncateLogMessage = (s, max = 1800) => {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
};

/** Karar daveti (süresi dolmamış, henüz çözülmemiş) varken tedarikçi teklifleri güncellenemez. */
const activeDecisionInviteWhere = (requestId) => ({
  requestId,
  expiresAt: { gt: new Date() },
  resolvedAt: null,
});

/** Bu statülerde tedarikçi hâlâ fiyat girebilir / revize edebilir. */
const VENDOR_QUOTE_OPEN_STATUSES = new Set(['SENT_TO_VENDOR', 'VENDOR_QUOTED', 'DRAFT']);

const isVendorQuoteLockedByStatus = (status) =>
  Boolean(status && !VENDOR_QUOTE_OPEN_STATUSES.has(status));

const assertQuoteEditableForRequest = async (requestId) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (isVendorQuoteLockedByStatus(request.status)) {
    const err = new Error(
      'Bu talep yetkili onay sürecine alındığı için teklif güncellenemez. Liste görüntülenebilir.',
    );
    err.statusCode = 403;
    throw err;
  }

  const invite = await prisma.procurementDecisionInvite.findFirst({
    where: activeDecisionInviteWhere(requestId),
    select: { id: true },
  });
  if (invite) {
    const err = new Error(
      'Bu talep için satın alma kararı süreci başlatıldığından teklif güncellemesi yapılamaz. Sorularınız için satın alma ekibiyle iletişime geçin.'
    );
    err.statusCode = 403;
    throw err;
  }
};

export const getAll = async (
  userId,
  role,
  userModuleId = 'URETIM_PLANLAMA',
  viewer = null,
  filters = {}
) => {
  if (role === 'DEPARTMENT') {
    throw forbid('Tedarikçi taleplerine erişim yetkiniz yok.', 403);
  }
  if (!['ADMIN', 'PURCHASING', 'SUPPLIER'].includes(role)) {
    throw forbid('Tedarikçi taleplerine erişim yetkiniz yok.', 403);
  }

  const attachmentSelect = {
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      vendorId: true,
      itemId: true,
      marketSourceId: true,
      kind: true,
      vendor: { select: { id: true, name: true } },
      item: { select: { id: true, productName: true } },
    },
  };

  const filterAtts = async (rows) => {
    if (role !== 'SUPPLIER') return rows;
    const vendor = await prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
    const vid = vendor?.id;
    return rows.map((r) => ({
      ...r,
      attachments: (r.attachments || []).filter((a) => isVendorVisibleAttachment(a, vid)),
    }));
  };

  if (role === 'SUPPLIER') {
    const rows = await prisma.procurementRequest.findMany({
      where: {
        assignments: { some: { vendor: { userId } } },
      },
      include: {
        assignments: { include: { vendor: true } },
        createdBy: { select: { id: true, name: true, moduleId: true } },
        items: requestItemsQuery({ product: true }),
        attachments: attachmentSelect,
      },
      orderBy: { createdAt: 'desc' },
    });
    const sorted = await Promise.all(rows.map((r) => withSortedItems(r)));
    const filtered = await filterAtts(sorted);
    return presentProcurementForViewer(filtered, viewer || { id: userId, role });
  }

  const whereClause = role === 'ADMIN' ? {} : { moduleId: userModuleId || 'URETIM_PLANLAMA' };
  if (filters.shopDepartmentId) whereClause.shopDepartmentId = filters.shopDepartmentId;
  if (filters.shopWorkerId) whereClause.shopWorkerId = filters.shopWorkerId;

  const rows = await prisma.procurementRequest.findMany({
    where: whereClause,
    include: {
      assignments: { include: { vendor: true } },
      createdBy: { select: { id: true, name: true, moduleId: true } },
      items: requestItemsQuery({
        product: true,
        quotes: { select: { vendorId: true, price: true } },
      }),
      attachments: attachmentSelect,
      ...shopRelationInclude,
    },
    orderBy: { createdAt: 'desc' },
  });
  const sorted = await Promise.all(rows.map((r) => withSortedItems(r)));
  return presentProcurementForViewer(
    sorted.map(attachQuoteRoundComplete),
    viewer || { id: userId, role, moduleId: userModuleId }
  );
};

/** Satın alma biriminin üç hattı salt okuduğu liste. Kendi hat listesinin yerini almaz. */
export const listCentral = async (viewer) => {
  if (viewer?.role !== 'ADMIN' && !isCentralProcurementReader(viewer)) {
    throw forbid('Merkezi tedarik takibi satın alma birimine açıktır.', 403);
  }
  const rows = await prisma.procurementRequest.findMany({
    where: { moduleId: { in: [MODULE.SATIN_ALMA, MODULE.URETIM, MODULE.YEDEK_PARCA] } },
    include: {
      assignments: { include: { vendor: { select: { id: true, name: true } } } },
      createdBy: { select: { id: true, name: true, moduleId: true } },
      assignedTo: { select: { id: true, name: true, moduleId: true, subRole: true } },
      items: requestItemsQuery({
        quotes: { select: { vendorId: true, price: true, currency: true } },
      }),
      approvalHistories: {
        select: { id: true, action: true, note: true, createdAt: true, actorUserId: true },
        orderBy: { createdAt: 'desc' },
      },
      project: { select: { id: true, code: true, name: true } },
      handovers: {
        where: { status: 'PENDING' },
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          direction: true,
          fromModuleId: true,
          toModuleId: true,
          note: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const sorted = await Promise.all(rows.map((row) => withSortedItems(row)));
  return presentProcurementForViewer(
    sorted.map(attachQuoteRoundComplete),
    viewer
  );
};

export const getById = async (id, viewer = null) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id },
    include: {
      items: requestItemsQuery({
        product: true,
        quotes: { include: { vendor: true } },
      }),
      assignments: { include: { vendor: true } },
      itemVendorPicks: {
        include: {
          vendor: { select: { id: true, name: true } },
          pickedBy: { select: { id: true, name: true } },
        },
      },
      comments: {
        include: {
          author: { select: { id: true, name: true, role: true } },
          targetVendor: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      attachments: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
          vendorId: true,
          itemId: true,
          marketSourceId: true,
          kind: true,
          vendor: { select: { id: true, name: true } },
          item: { select: { id: true, productName: true } },
          invoiceItems: { select: { itemId: true } },
        },
      },
      marketSources: {
        include: MARKET_SOURCE_INCLUDE,
        orderBy: { createdAt: 'asc' },
      },
      createdBy: { select: { id: true, name: true, email: true, phone: true, moduleId: true, subRole: true } },
      assignedTo: { select: { id: true, name: true, email: true, moduleId: true, subRole: true } },
      sourceInternalRequest: { select: { id: true, title: true } },
      ...shopRelationInclude,
      approvalHistories: {
        include: { actorUser: { select: { id: true, name: true, role: true, moduleId: true, subRole: true } } },
        orderBy: { createdAt: 'asc' },
      },
      handovers: {
        orderBy: { createdAt: 'desc' },
        include: {
          initiatedBy: { select: { id: true, name: true, moduleId: true, subRole: true } },
          decidedBy: { select: { id: true, name: true, moduleId: true, subRole: true } },
        },
      },
      vendorActivityLogs: {
        include: { vendor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      },
    },
  });

  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  if (viewer?.role === 'DEPARTMENT') {
    throw forbid('Bu talebe erişim yetkiniz yok.', 403);
  }

  let supplierVendorId = null;
  if (viewer?.role === 'SUPPLIER') {
    const v = await prisma.vendor.findUnique({ where: { userId: viewer.id }, select: { id: true } });
    if (!v?.id) throw forbid('Bu talebe erişim yetkiniz yok.', 403);
    const assigned = await prisma.requestVendorAssignment.findFirst({
      where: { requestId: id, vendorId: v.id },
      select: { id: true },
    });
    if (!assigned) throw forbid('Bu talebe erişim yetkiniz yok.', 403);
    supplierVendorId = v.id;
  } else if (viewer && viewer.role !== 'ADMIN') {
    assertProcurementReadable(viewer, request);
  }

  const decisionInvite = await prisma.procurementDecisionInvite.findFirst({
    where: activeDecisionInviteWhere(id),
    select: { id: true, emailSentAt: true },
  });

  let attachments = request.attachments;
  if (supplierVendorId) {
    attachments = (attachments || []).filter((a) => isVendorVisibleAttachment(a, supplierVendorId));
  }

  const sorted = await withSortedItems({ ...request, attachments });
  let executiveDecision = null;
  if (
    !supplierVendorId &&
    usesExecutiveDecisionInvite(sorted.moduleId) &&
    !usesSatinAlmaApprovalChain(sorted)
  ) {
    const assessment = assessPriorExecutiveApproval(sorted);
    const hasExecutive = (sorted.approvalHistories || []).some((row) =>
      ['EXECUTIVE_VENDOR_PICK', 'ADMIN_APPROVE', 'EXECUTIVE_VENDOR_PICK_REJECT', 'ADMIN_REJECT'].includes(
        row.action,
      ),
    );
    executiveDecision = {
      state: !hasExecutive ? 'absent' : assessment.valid ? 'valid' : 'invalid',
      reason: assessment.reason,
    };
  }
  const payload = {
    ...sorted,
    attachments,
    vendorActivityLogs: scrubVendorActivityLogs(sorted.vendorActivityLogs, viewer),
    quoteLockedByDecisionInvite: !!decisionInvite,
    decisionInviteMailPending: !!(decisionInvite && !decisionInvite.emailSentAt),
    executiveDecision,
  };

  const forViewer = supplierVendorId
    ? presentProcurementForVendor(
        { ...payload, marketSources: undefined },
        supplierVendorId
      )
    : attachMarketQuotesForDisplay(payload);

  return presentProcurementForViewer(forViewer, viewer);
};

export const upsertItemVendorPicks = async (requestId, userId, choices) => {
  if (!Array.isArray(choices)) {
    const err = new Error('choices must be an array.');
    err.statusCode = 400;
    throw err;
  }
  if (choices.length === 0) {
    return getById(requestId);
  }

  const rawRequest = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      items: requestItemsQuery({ quotes: { select: { vendorId: true } } }),
      assignments: { select: { vendorId: true } },
      marketSources: { select: { id: true, quotes: { select: { itemId: true } } } },
    },
  });

  if (!rawRequest) {
    const err = new Error('Procurement request not found.');
    err.statusCode = 404;
    throw err;
  }

  const request = await withSortedItems(rawRequest);

  const itemIds = new Set(request.items.map((i) => i.id));
  const validVendors = new Set(request.assignments.map((a) => a.vendorId));
  const marketById = new Map((request.marketSources || []).map((s) => [s.id, s]));

  const resolved = [];
  for (const c of choices) {
    if (!c || typeof c.itemId !== 'string') {
      const err = new Error('Each choice must include itemId.');
      err.statusCode = 400;
      throw err;
    }
    if (!itemIds.has(c.itemId)) {
      const err = new Error(`Geçersiz kalem: ${c.itemId}`);
      err.statusCode = 400;
      throw err;
    }
    const vendorId = c.vendorId === undefined ? null : c.vendorId;
    let chosenVendorId = null;
    let chosenMarketSourceId = null;
    if (vendorId !== null) {
      if (typeof vendorId !== 'string') {
        const err = new Error('vendorId must be a string or null.');
        err.statusCode = 400;
        throw err;
      }
      if (isMarketColumnId(vendorId)) {
        const sourceId = parseMarketSourceId(vendorId);
        const src = sourceId ? marketById.get(sourceId) : null;
        if (!src) {
          const err = new Error('Seçilen online satıcı bu talebe ait değil.');
          err.statusCode = 400;
          throw err;
        }
        const hasQuote = (src.quotes || []).some((q) => q.itemId === c.itemId);
        if (!hasQuote) {
          const err = new Error('Bu kalem için seçilen online satıcıdan fiyat yok.');
          err.statusCode = 400;
          throw err;
        }
        chosenMarketSourceId = sourceId;
      } else {
        if (!validVendors.has(vendorId)) {
          const err = new Error('Seçilen tedarikçi bu talebe atanmamış.');
          err.statusCode = 400;
          throw err;
        }
        const item = request.items.find((i) => i.id === c.itemId);
        const hasQuote = item?.quotes?.some((q) => q.vendorId === vendorId);
        if (!hasQuote) {
          const err = new Error('Bu kalem için seçilen firmadan teklif yok.');
          err.statusCode = 400;
          throw err;
        }
        chosenVendorId = vendorId;
      }
    }
    resolved.push({ itemId: c.itemId, chosenVendorId, chosenMarketSourceId });
  }

  const pickActor = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, moduleId: true, subRole: true },
  });
  assertSameModuleWriter(rawRequest, pickActor);

  if (!usesSatinAlmaApprovalChain(rawRequest) && isVendorQuoteLockedByStatus(rawRequest.status)) {
    const openInvite = await prisma.procurementDecisionInvite.findFirst({
      where: activeDecisionInviteWhere(requestId),
      select: { id: true },
    });
    if (!openInvite) {
      const err = new Error(
        'Üst yönetim kararından sonra tedarikçi seçimi değiştirilemez. Karar geçersizse yeni karar daveti gönderin.',
      );
      err.statusCode = 409;
      throw err;
    }
  }

  await prisma.$transaction(
    resolved.map((c) =>
      prisma.requestItemVendorPick.upsert({
        where: {
          requestId_itemId: { requestId, itemId: c.itemId },
        },
        create: {
          requestId,
          itemId: c.itemId,
          chosenVendorId: c.chosenVendorId,
          chosenMarketSourceId: c.chosenMarketSourceId,
          pickedByUserId: userId,
        },
        update: {
          chosenVendorId: c.chosenVendorId,
          chosenMarketSourceId: c.chosenMarketSourceId,
          pickedByUserId: userId,
        },
      }),
    ),
  );

  return getById(requestId);
};

/** Yedek parça yalnızca kendi tedarikçilerini talebe ekleyebilir; diğer hatların cari listesi kapalı. */
const assertVendorsInActorModule = async (vendorIds, actor) => {
  if (!actor || actor.role === 'ADMIN' || !isYedekParcaModule(actor.moduleId)) return;
  const ids = [...new Set((vendorIds || []).filter(Boolean))];
  if (!ids.length) return;
  const rows = await prisma.vendor.findMany({
    where: { id: { in: ids } },
    select: { id: true, moduleId: true, user: { select: { moduleId: true } } },
  });
  const allowed = rows.filter(
    (v) => v.moduleId === actor.moduleId || v.user?.moduleId === actor.moduleId,
  );
  if (allowed.length !== ids.length) {
    throw forbid('Yalnızca Yedek Parça birimine ait tedarikçiler talebe eklenebilir.', 403);
  }
};

export const create = async (data, createdById, actor = null, userModuleId = null) => {
  const {
    vendorIds,
    items,
    notificationCcEmails,
    quoteCollectDays,
    shopDepartmentId,
    shopWorkerId,
    internalNote,
    projectId,
    ...rest
  } = data;
  const sortOrderWrites = [];

  let targetModuleId = userModuleId;
  if (!targetModuleId) {
    const creatorUser = await prisma.user.findUnique({ where: { id: createdById }, select: { moduleId: true } });
    targetModuleId = creatorUser?.moduleId || 'URETIM_PLANLAMA';
  }

  if (
    (targetModuleId === 'SATIN_ALMA' || targetModuleId === 'URETIM_PLANLAMA') &&
    actor &&
    !canCreateStandaloneRfq(actor)
  ) {
    throw forbid(
      targetModuleId === 'URETIM_PLANLAMA'
        ? 'Üretim personeli doğrudan tedarikçi talebi açamaz. Birim talebi açın; birim yetkilisi onayladıktan sonra tedarikçilere gönderilir.'
        : 'Satın alma personeli doğrudan tedarikçi talebi açamaz. Birim talebi açın; Satın Alma Birimi Yetkilisi onayladıktan sonra teklif toplanır.',
      403
    );
  }

  await assertVendorsInActorModule(vendorIds, actor);

  if (rest.status && !['DRAFT', 'SENT_TO_VENDOR'].includes(rest.status)) {
    const err = new Error(
      'Talep oluşturulurken yalnızca taslak veya tedarikçiye iletildi durumu kullanılabilir. Tamamlama ve onay durumları bu uçtan yazılamaz.'
    );
    err.statusCode = 409;
    throw err;
  }

  const deadline = resolveQuoteDeadline({ deadline: rest.deadline, quoteCollectDays });
  rest.deadline = deadline;
  if (!usesPurchasingQuoteForm(targetModuleId)) {
    rest.quoteVatIncluded = null;
    rest.quoteVatRate = null;
    rest.quoteHasMaturity = null;
    rest.quoteMaturityDays = null;
  }

  const shopPatch = await resolveShopFields({ shopDepartmentId, shopWorkerId });
  const resolvedProjectId = await resolveRequestProjectId(targetModuleId, projectId);
  const notePatch =
    internalNote !== undefined
      ? {
          internalNote:
            internalNote == null || String(internalNote).trim() === ''
              ? null
              : String(internalNote).trim(),
        }
      : {};

  const requestId = await prisma.$transaction(async (tx) => {
    const req = await tx.procurementRequest.create({
      data: {
        ...rest,
        ...shopPatch,
        ...notePatch,
        projectId: resolvedProjectId,
        createdById,
        moduleId: targetModuleId,
        assignments: vendorIds
          ? {
              create: vendorIds.map((vendorId) => ({
                vendorId,
                ...newAssignmentTokenFields(deadline),
              })),
            }
          : undefined,
      },
      include: {
        assignments: { include: { vendor: true } },
      },
    });

    if (items?.length) {
      for (const [index, item] of items.entries()) {
        const row = mapRequestItemRow(item, index);
        const created = await tx.requestItem.create({
          data: { ...row, requestId: req.id },
        });
        sortOrderWrites.push({ itemId: created.id, item, index });
      }
    }

    return req.id;
  });

  await persistItemSortOrders(sortOrderWrites);

  const request = await getById(requestId, actor);
  if (targetModuleId === 'SATIN_ALMA') {
    await linkSatinAlmaRfqToInbox(requestId).catch((e) =>
      console.error('Birim panosuna bağlanamadı:', e.message)
    );
  }

  // Dış bildirim yalnız tedarikçiye gönderim aşamasında
  if (vendorIds && vendorIds.length > 0 && request.status === 'SENT_TO_VENDOR') {
    const notifyErrors = [];
    const freshAssignments = await prisma.requestVendorAssignment.findMany({
      where: { requestId },
      include: { vendor: true },
    });
    for (const assignment of freshAssignments) {
      if (!assignment.quoteToken) continue;
      try {
        await notifyVendor({
          vendor: assignment.vendor,
          request,
        items: request.items,
        quoteToken: assignment.quoteToken,
          quoteShortCode: assignment.quoteShortCode,
        cc: notificationCcEmails,
          actor,
        });
      } catch (err) {
        console.error('Vendor notify error:', err.message);
        notifyErrors.push({ vendorId: assignment.vendorId, message: err.message });
      }
    }
    return presentProcurementForViewer({ ...request, _notifyErrors: notifyErrors }, actor);
  }

  return presentProcurementForViewer(request, actor);
};

/**
 * Tedarikçiye talep bildirim e-postasını yeniden gönderir (aynı quoteToken / bağlantı).
 */
export const resendVendorNotificationEmail = async (requestId, vendorId, actor = null) => {
  let request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      items: requestItemsQuery(),
      assignments: {
        where: { vendorId },
        // Yetkili kişiler de bildirim alıyor: adres kontrolü için birlikte yüklenmeli
        include: { vendor: { include: { contacts: true } } },
      },
    },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  request = await withSortedItems(request);
  const assignment = request.assignments[0];
  if (!assignment) {
    const err = new Error('Bu tedarikçi bu talebe atanmamış.');
    err.statusCode = 404;
    throw err;
  }
  if (!assignment.quoteToken) {
    const err = new Error('Teklif bağlantısı oluşturulmamış.');
    err.statusCode = 400;
    throw err;
  }
  const vendor = assignment.vendor;
  const { resolveVendorNotificationEmails } = await import('../mail/mail.service.js');
  if (!resolveVendorNotificationEmails(vendor).length) {
    const err = new Error('Tedarikçi için geçerli bildirim e-postası tanımlı değil.');
    err.statusCode = 400;
    throw err;
  }
  const sent = await notifyVendor({
    vendor,
    request,
    items: request.items,
    quoteToken: assignment.quoteToken,
    quoteShortCode: assignment.quoteShortCode,
    cc: [],
    actor,
    channels: ['email'],
  });
  if (!sent.email) {
    const err = new Error('E-posta gönderilemedi (ayarlar veya ağ hatası).');
    err.statusCode = 502;
    throw err;
  }
  await logVendorActivity(
    requestId,
    vendorId,
    'RESEND_EMAIL',
    'Teklif bildirimi tekrar gönderildi.',
  );
  return { sent: true, channels: sent };
};

/**
 * Teklif bağlantısını tedarikçi telefonuna SMS ile yeniden gönderir.
 * phoneOverride: kayıtlı numara yoksa veya geçici alıcı için.
 */
export const resendVendorNotificationSms = async (
  requestId,
  vendorId,
  actor = null,
  { phone: phoneOverride = null } = {},
) => {
  let request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      items: requestItemsQuery(),
      assignments: {
        where: { vendorId },
        // Yetkili kişilerin numaraları da SMS alıyor
        include: { vendor: { include: { contacts: true } } },
      },
    },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  request = await withSortedItems(request);
  const assignment = request.assignments[0];
  if (!assignment) {
    const err = new Error('Bu tedarikçi bu talebe atanmamış.');
    err.statusCode = 404;
    throw err;
  }
  if (!assignment.quoteToken) {
    const err = new Error('Teklif bağlantısı oluşturulmamış.');
    err.statusCode = 400;
    throw err;
  }
  const vendor = assignment.vendor;
  const override = phoneOverride != null ? String(phoneOverride).trim() : '';
  const registered = String(vendor.contactPhone || '').trim();
  if (override && registered && actor?.role !== 'ADMIN') {
    const err = new Error('Kayıtlı numarayı değiştirmek yalnızca sistem yöneticisine açıktır.');
    err.statusCode = 403;
    throw err;
  }
  const targetPhone = override || registered;
  if (!targetPhone) {
    const err = new Error('Telefon numarası gerekli.');
    err.statusCode = 400;
    throw err;
  }
  const sent = await notifyVendor({
    vendor,
    request,
    items: request.items,
    quoteToken: assignment.quoteToken,
    quoteShortCode: assignment.quoteShortCode,
    cc: [],
    actor,
    channels: ['sms'],
    phoneOverride: override || null,
    forceSms: true,
  });
  if (!sent.sms) {
    const err = new Error(
      sent.smsReason ||
        'SMS gönderilemedi. SMS ayarlarını ve telefon numarasını kontrol edin.',
    );
    err.statusCode = 502;
    throw err;
  }
  const phoneNote = sent.smsPhone ? ` [[admin-phone:${sent.smsPhone}]]` : '';
  await logVendorActivity(
    requestId,
    vendorId,
    'RESEND_SMS',
    `Teklif bağlantısı telefona tekrar gönderildi.${phoneNote}`,
  );
  return { sent: true, channels: sent, phone: sent.smsPhone || null };
};

export const update = async (id, data, actor = null, viewerUser = null) => {
  const {
    vendorIds,
    items,
    notificationCcEmails,
    quoteCollectDays,
    shopDepartmentId,
    shopWorkerId,
    internalNote,
    projectId,
    ...rest
  } = data;

  const currentRow = await prisma.procurementRequest.findUnique({
    where: { id },
    select: {
      moduleId: true,
      purchasingResponsibleModuleId: true,
      deadline: true,
      status: true,
      shopDepartmentId: true,
      shopWorkerId: true,
      projectId: true,
    },
  });
  if (!currentRow) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const actorRole = actor?.role || viewerUser?.role;
  if (actorRole === 'SUPPLIER') {
    const vendor = actor?.id
      ? await prisma.vendor.findUnique({ where: { userId: actor.id }, select: { id: true } })
      : null;
    const assigned = vendor
      ? await prisma.requestVendorAssignment.findFirst({
          where: { requestId: id, vendorId: vendor.id },
          select: { id: true },
        })
      : null;
    if (!assigned) throw forbid('Bu talebe erişim yetkiniz yok.', 403);
    const restKeys = Object.keys(rest).filter((key) => rest[key] !== undefined && key !== 'status');
    if (
      items !== undefined ||
      vendorIds !== undefined ||
      projectId !== undefined ||
      shopDepartmentId !== undefined ||
      shopWorkerId !== undefined ||
      internalNote !== undefined ||
      quoteCollectDays !== undefined ||
      restKeys.length
    ) {
      throw forbid('Tedarikçi talep içeriğini değiştiremez.', 403);
    }
    if (rest.status !== 'IN_PRODUCTION' || currentRow.status !== 'VENDOR_APPROVED') {
      throw forbid('Tedarikçi yalnızca onaylanmış siparişte hazırlık bildirebilir.', 403);
    }
  } else {
    assertSameModuleWriter(currentRow, actor || viewerUser);
  }

  if (rest.status === 'COMPLETED') {
    const err = new Error(
      'Satın alma tamamlandı durumu yalnızca satın alma tamamlama adımından yazılır. Kur ve fiyat kaydı bu adımda oluşur.'
    );
    err.statusCode = 409;
    throw err;
  }

  const quoteLocked =
    isVendorQuoteLockedByStatus(currentRow.status) ||
    Boolean(
      await prisma.procurementDecisionInvite.findFirst({
        where: activeDecisionInviteWhere(id),
        select: { id: true },
      })
    );
  if (quoteLocked && actorRole !== 'SUPPLIER') {
    const touchesStructure =
      items !== undefined ||
      vendorIds !== undefined ||
      projectId !== undefined ||
      shopDepartmentId !== undefined ||
      shopWorkerId !== undefined ||
      quoteCollectDays !== undefined ||
      rest.deadline !== undefined ||
      rest.quoteVatIncluded !== undefined ||
      rest.quoteVatRate !== undefined ||
      rest.quoteHasMaturity !== undefined ||
      rest.quoteMaturityDays !== undefined;
    if (touchesStructure) {
      const err = new Error('Teklif kilitliyken kalem, tedarikçi veya fiyat alanları değiştirilemez.');
      err.statusCode = 409;
      throw err;
    }
  }
  if (rest.status === 'CANCELLED' && isVendorQuoteLockedByStatus(currentRow.status)) {
    const err = new Error('Onay sürecine girmiş talep bu uçtan iptal edilemez.');
    err.statusCode = 409;
    throw err;
  }

  if (projectId !== undefined) {
    rest.projectId = await resolveRequestProjectId(currentRow?.moduleId || MODULE.URETIM, projectId, {
      allowInactiveId: currentRow?.projectId,
    });
  }
  const previousStatus = currentRow?.status;
  await assertVendorsInActorModule(vendorIds, actor);
  if (rest.deadline !== undefined || quoteCollectDays !== undefined) {
    rest.deadline = resolveQuoteDeadline({
      deadline: rest.deadline,
      quoteCollectDays: quoteCollectDays ?? undefined,
    });
  }
  if (!usesPurchasingQuoteForm(currentRow?.moduleId || MODULE.URETIM)) {
    if (rest.quoteVatIncluded !== undefined) rest.quoteVatIncluded = null;
    if (rest.quoteVatRate !== undefined) rest.quoteVatRate = null;
    if (rest.quoteHasMaturity !== undefined) rest.quoteHasMaturity = null;
    if (rest.quoteMaturityDays !== undefined) rest.quoteMaturityDays = null;
  }

  const shopPatch = await resolveShopFields(
    {
      ...(shopDepartmentId !== undefined ? { shopDepartmentId } : {}),
      ...(shopWorkerId !== undefined ? { shopWorkerId } : {}),
    },
    { existing: currentRow }
  );
  if (internalNote !== undefined) {
    rest.internalNote =
      internalNote == null || String(internalNote).trim() === ''
        ? null
        : String(internalNote).trim();
  }
  Object.assign(rest, shopPatch);

  const scalarData = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined)
  );

  /** Yalnızca bu güncellemede oluşturulan atamalara teklif e-postası gider (mevcut tedarikçilere yeniden gönderilmez). */
  let newAssignmentsForEmail = [];
  const sortOrderWrites = [];

  if (scalarData.status && requiresExecutiveForAnyApproval(currentRow?.moduleId)) {
    const executiveOnly = [
      'PENDING_MANAGER_APPROVAL',
      'PENDING_ADMIN_APPROVAL',
      'RETURNED_TO_MANAGER',
      'APPROVED_FOR_PURCHASE',
      'VENDOR_APPROVED',
    ];
    const afterApproval = ['IN_PRODUCTION', 'HAS_ISSUES', 'COMPLETED'];
    if (executiveOnly.includes(scalarData.status) && scalarData.status !== previousStatus) {
      throw forbid(
        'Yedek parça talepleri birim tarafından onaylanamaz. Fiyatları üst yönetime karar için gönderin.',
        409,
      );
    }
    if (
      afterApproval.includes(scalarData.status) &&
      !['VENDOR_APPROVED', ...afterApproval].includes(previousStatus)
    ) {
      throw forbid('Bu adım yalnızca üst yönetim onayından sonra yapılabilir.', 409);
    }
  }

  if (scalarData.status && viewerUser) {
    const supplierPrep =
      viewerUser.role === 'SUPPLIER' &&
      scalarData.status === 'IN_PRODUCTION' &&
      previousStatus === 'VENDOR_APPROVED';
    const restrictedStatuses = ['APPROVED_FOR_PURCHASE', 'VENDOR_APPROVED', 'IN_PRODUCTION', 'PENDING_ADMIN_APPROVAL'];
    if (!supplierPrep && restrictedStatuses.includes(scalarData.status)) {
      if (viewerUser.role !== 'ADMIN' && viewerUser.subRole !== 'MANAGER') {
        const err = new Error('Teklif onaylama ve durum değiştirme yetkiniz bulunmamaktadır. Bu işlemi yalnızca Satın Alma Birimi Yetkilisi (Müdür) veya Sistem Yöneticisi gerçekleştirebilir.');
        err.statusCode = 403;
        throw err;
      }
    }

    /**
     * Onay durumları yalnızca onay akışı uçlarından değiştirilebilir.
     * Doğrudan durum güncellemesi parasal limiti ve karar davetini atlatır.
     */
    const approvalFlowStatuses = [
      'PENDING_MANAGER_APPROVAL',
      'PENDING_ADMIN_APPROVAL',
      'RETURNED_TO_MANAGER',
      'APPROVED_FOR_PURCHASE',
      'VENDOR_APPROVED',
    ];
    if (approvalFlowStatuses.includes(scalarData.status) && scalarData.status !== previousStatus) {
      const err = new Error(
        'Onay durumu doğrudan değiştirilemez. Satın almada onay adımlarını, üretim ve yedek parçada karar davetini kullanın.'
      );
      err.statusCode = 409;
      throw err;
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(scalarData).length > 0) {
      await tx.procurementRequest.update({
        where: { id },
        data: scalarData,
      });
    }

    if (scalarData.deadline) {
      await tx.requestVendorAssignment.updateMany({
        where: { requestId: id },
        data: { tokenExpires: scalarData.deadline },
      });
    }

    if (vendorIds !== undefined) {
      if (!Array.isArray(vendorIds)) {
        const err = new Error('vendorIds must be an array');
        err.statusCode = 400;
        throw err;
      }
      const current = await tx.requestVendorAssignment.findMany({ where: { requestId: id } });
      const byVendor = new Map(current.map((a) => [a.vendorId, a]));
      const nextSet = new Set(vendorIds);

      const toRemove = current.filter((a) => !nextSet.has(a.vendorId));
      if (toRemove.length > 0) {
        await tx.requestVendorAssignment.deleteMany({
          where: { id: { in: toRemove.map((a) => a.id) } },
        });
      }

      for (const vid of vendorIds) {
        if (!byVendor.has(vid)) {
          const created = await tx.requestVendorAssignment.create({
            data: {
              requestId: id,
              vendorId: vid,
              ...newAssignmentTokenFields(
                scalarData.deadline || currentRow?.deadline || resolveQuoteDeadline({})
              ),
            },
            include: { vendor: true },
          });
          newAssignmentsForEmail.push(created);
        }
      }
    }

    if (items !== undefined) {
      if (!Array.isArray(items)) {
        const err = new Error('items must be an array');
        err.statusCode = 400;
        throw err;
      }

      const originalExisting = await tx.requestItem.findMany({ where: { requestId: id } });
      const originalExistingIds = new Set(originalExisting.map((i) => i.id));

      const incomingIdsSet = new Set(items.map((i) => i.id).filter(Boolean));
      const toDelete = originalExisting.filter((e) => !incomingIdsSet.has(e.id));
      if (toDelete.length > 0) {
        await tx.requestItem.deleteMany({
          where: { id: { in: toDelete.map((x) => x.id) } },
        });
      }

      for (const [index, item] of items.entries()) {
        const row = mapRequestItemRow(item, index);

        if (item.id && originalExistingIds.has(item.id)) {
          await tx.requestItem.update({
            where: { id: item.id },
            data: row,
          });
          sortOrderWrites.push({ itemId: item.id, item, index });
        } else {
          const created = await tx.requestItem.create({
            data: { ...row, requestId: id },
          });
          sortOrderWrites.push({ itemId: created.id, item, index });
        }
      }
    }
  });

  await persistItemSortOrders(sortOrderWrites);

  const result = await getById(id, viewerUser);
  const becameSent =
    result.status === 'SENT_TO_VENDOR' && previousStatus && previousStatus !== 'SENT_TO_VENDOR';

  /** Teklif formu hâlâ açıkken eklenen yeni tedarikçilere de mail gitsin (Teklif Geldi dahil). */
  const quoteStillOpen =
    result.status === 'SENT_TO_VENDOR' || result.status === 'VENDOR_QUOTED';

  const shouldNotifyVendors =
    quoteStillOpen && (becameSent || newAssignmentsForEmail.length > 0);

  if (shouldNotifyVendors) {
    const notifyErrors = [];
    const freshAssignments = await prisma.requestVendorAssignment.findMany({
      where: { requestId: id },
      include: { vendor: true },
    });
    const targetIds = becameSent
      ? new Set(freshAssignments.map((a) => a.vendorId))
      : new Set(newAssignmentsForEmail.map((a) => a.vendorId));
    let sentCount = 0;
    for (const assignment of freshAssignments) {
      if (!targetIds.has(assignment.vendorId) || !assignment.quoteToken) continue;
      try {
        await notifyVendor({
          vendor: assignment.vendor,
          request: result,
          items: result.items,
          quoteToken: assignment.quoteToken,
          quoteShortCode: assignment.quoteShortCode,
          cc: notificationCcEmails,
          actor: actor || viewerUser,
        });
        sentCount += 1;
      } catch (err) {
        console.error('Vendor notify error:', err.message);
        notifyErrors.push({ vendorId: assignment.vendorId, message: err.message });
      }
    }
    return {
      ...result,
      _newVendorEmailsSent: sentCount,
      _notifyErrors: notifyErrors,
    };
  }

  return {
    ...result,
    _newVendorEmailsSent: 0,
  };
};

export const remove = async (id, actor = null) => {
  const existing = await prisma.procurementRequest.findUnique({
    where: { id },
    include: { attachments: true, sourceInternalRequest: { select: { id: true, status: true } } },
  });
  if (!existing) {
    const err = new Error('Procurement request not found.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(existing, actor);

  for (const att of existing.attachments || []) {
    if (!att?.path) continue;
    try {
      const filePath = path.isAbsolute(att.path) ? att.path : path.join(process.cwd(), att.path);
      await fs.unlink(filePath);
    } catch {
      // Dosya yoksa veya erişilemiyorsa veritabanı silimine devam et
    }
  }

  const internalId = existing.sourceInternalRequest?.id || existing.internalRequestId || null;
  let restoredFully = false;
  await prisma.$transaction(async (tx) => {
    await tx.internalRequestItem.updateMany({
      where: { procurementRequestId: id },
      data: { procurementRequestId: null },
    });
    await tx.procurementRequest.delete({ where: { id } });
    if (!internalId) return;
    const covered = await tx.internalRequestItem.count({
      where: { requestId: internalId, procurementRequestId: { not: null } },
    });
    restoredFully = covered === 0;
    await tx.internalRequest.update({
      where: { id: internalId },
      data: { status: covered === 0 ? 'APPROVED' : 'CONVERTED' },
    });
  });

  const actorName = actor?.name || 'Bir kullanıcı';
  const restored = Boolean(existing.sourceInternalRequest);
  await recordAudit({
    actorUserId: actor?.id || null,
    action: 'PROCUREMENT_REQUEST_DELETED',
    severity: 'ALERT',
    requestId: null,
    payload: {
      deletedRequestId: id,
      title: existing.title,
      moduleId: existing.moduleId,
      restoredInternalRequest: restored,
    },
    notifyMessage: !restored
      ? `${actorName}, "${existing.title}" tedarikçi talebini sildi.`
      : restoredFully
        ? `${actorName}, "${existing.title}" tedarikçi talebini sildi. Bağlı birim talebi yeniden onaylı duruma alındı.`
        : `${actorName}, "${existing.title}" tedarikçi talebini sildi. Bu kalemler birim talebine geri döndü.`,
  });
};

export const addComment = async (requestId, authorId, content, targetVendorId) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true, role: true, moduleId: true },
  });
  if (author?.role === 'SUPPLIER') {
    const vendor = await prisma.vendor.findUnique({ where: { userId: authorId }, select: { id: true } });
    const assigned = vendor
      ? await prisma.requestVendorAssignment.findFirst({
          where: { requestId, vendorId: vendor.id },
          select: { id: true },
        })
      : null;
    if (!assigned) throw forbid('Bu talebe erişim yetkiniz yok.', 403);
  } else {
    assertSameModuleWriter(request, author);
  }
  return prisma.comment.create({
    data: {
      content,
      requestId,
      authorId,
      targetVendorId
    },
    include: { author: { select: { id: true, name: true, role: true } } }
  });
};

const buildAssignmentCommercialUpdate = ({
  overallDiscountRate,
  isShippingIncluded,
  isVatIncluded,
  vatRate,
  hasMaturity,
  maturityDays,
  usdRateFixed,
  usdRate,
  eurRate,
  chfRate,
  quoteNote,
} = {}) => {
  const data = {};
  if (overallDiscountRate !== undefined) data.overallDiscountRate = overallDiscountRate;
  if (isShippingIncluded !== undefined) data.isShippingIncluded = isShippingIncluded;
  if (isVatIncluded !== undefined) data.isVatIncluded = isVatIncluded;
  if (vatRate !== undefined) data.vatRate = vatRate;
  if (hasMaturity !== undefined) data.hasMaturity = hasMaturity;
  if (maturityDays !== undefined) data.maturityDays = maturityDays;
  if (usdRateFixed !== undefined) data.usdRateFixed = Boolean(usdRateFixed);
  if (usdRate !== undefined) data.usdRate = usdRate;
  if (eurRate !== undefined) data.eurRate = eurRate;
  if (chfRate !== undefined) data.chfRate = chfRate;
  if (quoteNote !== undefined) {
    const t = quoteNote == null ? '' : String(quoteNote).trim();
    data.quoteNote = t === '' ? null : t;
  }
  return data;
};

const quotedVendorIdsFromItems = (items) => {
  const ids = new Set();
  for (const it of items || []) {
    for (const q of it.quotes || []) {
      if (!q?.vendorId) continue;
      const n = Number(q.price);
      if (q.price != null && Number.isFinite(n)) ids.add(q.vendorId);
    }
  }
  return ids;
};

const QUOTE_ROUND_OPEN = new Set(['SENT_TO_VENDOR', 'VENDOR_QUOTED']);

/** Herkes fiyat verdi veya teklif süresi doldu — değerlendirmeye hazır. */
const computeQuoteRoundComplete = (request) => {
  if (!QUOTE_ROUND_OPEN.has(request?.status)) return false;
  const assignedIds = [
    ...new Set((request.assignments || []).map((a) => a.vendorId).filter(Boolean)),
  ];
  if (!assignedIds.length) return false;
  const allQuoted = assignedIds.every((id) => quotedVendorIdsFromItems(request.items).has(id));
  const deadlinePassed = request.deadline
    ? new Date(request.deadline).getTime() <= Date.now()
    : false;
  return allQuoted || deadlinePassed;
};

const attachQuoteRoundComplete = (row) => {
  const quoteRoundComplete = computeQuoteRoundComplete(row);
  return {
    ...row,
    quoteRoundComplete,
    items: (row.items || []).map((it) => {
      if (!it || typeof it !== 'object' || !('quotes' in it)) return it;
      const { quotes, ...rest } = it;
      return rest;
    }),
  };
};

/**
 * Atanan her tedarikçi en az bir fiyatlı teklif verince, geçiş anında bir kez
 * portal zili + teklif-geldi maili (mevcut Notification + QUOTE_RECEIVED).
 */
const notifyAllQuotesCompleteIfNeeded = async ({ request, itemsBefore, itemsAfter }) => {
  if (!request?.id) return;
  const assignments = await prisma.requestVendorAssignment.findMany({
    where: { requestId: request.id },
    select: { vendorId: true, vendor: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const assignedIds = [...new Set(assignments.map((a) => a.vendorId).filter(Boolean))];
  if (assignedIds.length < 2) return;

  const before = quotedVendorIdsFromItems(itemsBefore);
  const after = quotedVendorIdsFromItems(itemsAfter);
  const wasComplete = assignedIds.every((id) => before.has(id));
  const isComplete = assignedIds.every((id) => after.has(id));
  if (wasComplete || !isComplete) return;

  const recipientIds = await filterNotifyUserIds(prisma, [request.createdById, request.assignedToId]);
  const count = assignedIds.length;
  const title = request.title || 'Talep';
  if (recipientIds.length) {
    try {
      await prisma.notification.createMany({
        data: recipientIds.map((userId) => ({
          userId,
          kind: 'ALERT',
          message: `"${title}" talebinde tüm tedarikçilerden teklif geldi (${count}/${count}).`,
          link: `/procurement/${request.id}`,
        })),
      });
    } catch (err) {
      console.error('❌ Tüm teklifler portal bildirimi oluşturulamadı:', err.message);
    }
  }

  try {
    const { sendAllQuotesCompleteEmail } = await import('../mail/mail.service.js');
    await sendAllQuotesCompleteEmail({
      request: {
        id: request.id,
        title: request.title,
        createdById: request.createdById,
        assignedToId: request.assignedToId,
      },
      vendorNames: assignments.map((a) => a.vendor?.name).filter(Boolean),
    });
  } catch (err) {
    console.error('All-quotes complete email error:', err?.message || err);
  }
};

export const submitQuote = async (requestId, items, user, overallDiscountRate, commercialTerms = {}) => {
  let request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: { items: requestItemsQuery({ quotes: true }) }
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  request = await withSortedItems(request);

  const vendor = await prisma.vendor.findFirst({ where: { userId: user.id } });
  if (!vendor) throw forbid('Vendor associated with this user was not found.', 403);

  const assignmentRow = await prisma.requestVendorAssignment.findUnique({
    where: { requestId_vendorId: { requestId, vendorId: vendor.id } },
    include: { request: { select: { status: true } } },
  });
  if (!assignmentRow) {
    throw forbid('Bu talebe atanmadığınız için teklif gönderemezsiniz.', 403);
  }

  // Public token ile aynı yazma kuralları (süre + onay kilidi)
  assertQuoteLinkWritable({
    ...assignmentRow,
    request: { status: request.status },
  });

  await assertQuoteEditableForRequest(requestId);

  items = normalizeSatinAlmaQuoteItems(items, request.moduleId);
  commercialTerms = normalizeSatinAlmaUsdTerms(commercialTerms, request.moduleId, items);

  const prevOverall = assignmentRow?.overallDiscountRate ?? null;

  const summaryLines = buildVendorQuoteChangeSummary({
    requestItems: request.items,
    submittedItems: items,
    vendorId: vendor.id,
    prevOverallDiscount: prevOverall,
    newOverallDiscount: overallDiscountRate,
  });

  const logMessage = truncateLogMessage(
    summaryLines.length > 0
      ? `Teklif güncellendi: ${summaryLines.join(' | ')}`
      : 'Teklif iletildi (kayıtlı değerlerde değişiklik yok).'
  );

  // Run all item quote upserts
  const updatedRequest = await prisma.$transaction(async (tx) => {
    await Promise.all(
      items.map(async (item) => {
        if (item.price === null || item.price === undefined) return;
        
        const existingQuote = await tx.requestItemQuote.findUnique({
          where: { itemId_vendorId: { itemId: item.id, vendorId: vendor.id } }
        });

        if (existingQuote) {
          return tx.requestItemQuote.update({
            where: { id: existingQuote.id },
            data: quoteWriteData(item),
          });
        } else {
          return tx.requestItemQuote.create({
            data: {
              ...quoteWriteData(item),
              itemId: item.id,
              vendorId: vendor.id
            }
          });
        }
      })
    );

    const commercialUpdate = buildAssignmentCommercialUpdate({
      overallDiscountRate,
      ...commercialTerms,
    });
    if (Object.keys(commercialUpdate).length) {
      await tx.requestVendorAssignment.update({
        where: { requestId_vendorId: { requestId, vendorId: vendor.id } },
        data: commercialUpdate,
      });
    }

    await tx.vendorActivityLog.create({
      data: {
        requestId,
        vendorId: vendor.id,
        action: 'SUBMIT',
        message: logMessage,
      },
    });

    return tx.procurementRequest.update({
      where: { id: requestId },
      data: { status: 'VENDOR_QUOTED' },
      include: { items: requestItemsQuery({ quotes: true }) },
    });
  });

  // Fire & forget — teklif geldi/güncellendi maili (yalnız talebi açan)
  // Her fiyatlı gönderimde mail düşer (ilk giriş ve güncelleme). Outbox’a yazılır.
  const hadPriorQuotes = (request.items || []).some((it) =>
    (it.quotes || []).some((q) => q.vendorId === vendor.id && q.price != null)
  );
  const pricedSubmitted = (items || []).some((i) => {
    const n = Number(i?.price);
    return i?.price !== null && i?.price !== undefined && i?.price !== '' && Number.isFinite(n);
  });
  if (pricedSubmitted) {
    const overallDiscountChange = hadPriorQuotes
      ? overallDiscountChangeForEmail(prevOverall, overallDiscountRate)
      : null;
    const quotedItemsForEmail = buildQuotedItemsForEmail({
      requestItems: request.items,
      submittedItems: items,
      vendorId: vendor.id,
      isUpdate: hadPriorQuotes,
    });
    const shouldMail =
      !hadPriorQuotes || quotedItemsForEmail.length > 0 || Boolean(overallDiscountChange);
    if (shouldMail) {
      const { sendQuoteNotificationEmail } = await import('../mail/mail.service.js');
      try {
        await sendQuoteNotificationEmail({
      vendorName: vendor.name,
          request: {
            id: request.id,
            title: request.title,
            moduleId: request.moduleId,
            createdById: request.createdById,
          },
      quotedItems: quotedItemsForEmail,
          isUpdate: hadPriorQuotes,
          overallDiscountChange,
        });
      } catch (err) {
        console.error('Quote email error:', err?.message || err);
      }
    }
    try {
      await notifyAllQuotesCompleteIfNeeded({
        request,
        itemsBefore: request.items,
        itemsAfter: updatedRequest.items,
      });
    } catch (err) {
      console.error('All-quotes complete notify:', err?.message || err);
    }
  }

  return withSortedItems(updatedRequest);
};

const isQuoteLinkExpired = (assignment) =>
  Boolean(assignment?.tokenExpires && assignment.tokenExpires < new Date());

const assertQuoteLinkWritable = (assignment) => {
  if (!assignment) {
    const err = new Error('Geçersiz teklif bağlantısı.');
    err.statusCode = 404;
    throw err;
  }
  if (isVendorQuoteLockedByStatus(assignment.request?.status)) {
    const err = new Error(
      'Bu talep yetkili onay sürecine alındığı için teklif güncellenemez. Liste görüntülenebilir.',
    );
    err.statusCode = 403;
    throw err;
  }
  if (isQuoteLinkExpired(assignment)) {
    const err = new Error('Teklif süresi doldu. Liste görüntülenebilir, fiyat ve ek dosya gönderilemez.');
    err.statusCode = 403;
    throw err;
  }
};

export const getByToken = async (token) => {
  const assignment = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken: token },
    include: {
      request: {
        include: {
          items: requestItemsQuery({ quotes: { include: { vendor: true } } }),
          attachments: {
            select: {
              id: true,
              originalName: true,
              mimeType: true,
              size: true,
              createdAt: true,
              vendorId: true,
              itemId: true,
              marketSourceId: true,
              kind: true,
              vendor: { select: { id: true, name: true } },
              item: { select: { id: true, productName: true } },
            },
          },
          createdBy: { select: { id: true, name: true, email: true, phone: true, moduleId: true, subRole: true } },
        }
      },
      vendor: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
          extraContactEmails: true,
          contactPhone: true,
          extraContactPhones: true,
          taxId: true,
          city: true,
          district: true,
          address: true,
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            select: {
              name: true,
              title: true,
              email: true,
              phone: true,
              isPrimary: true,
            },
          },
        },
      },
    }
  });

  if (!assignment) {
    const err = new Error('Geçersiz teklif bağlantısı.');
    err.statusCode = 404;
    throw err;
  }

  const decisionInvite = await prisma.procurementDecisionInvite.findFirst({
    where: activeDecisionInviteWhere(assignment.requestId),
    select: { id: true },
  });
  const quoteLockedByDecisionInvite = !!decisionInvite;
  const quoteLockedByApproval = isVendorQuoteLockedByStatus(assignment.request?.status);
  // Süre dolsa / onayda kilitli olsa da GET 200 döner; sayfa açılır, form kilitlenir.
  const quoteExpired = isQuoteLinkExpired(assignment) || quoteLockedByApproval;
  const quoteLockReason = quoteLockedByApproval
    ? 'approval'
    : isQuoteLinkExpired(assignment)
      ? 'deadline'
      : null;

  if (!quoteLockedByDecisionInvite && !quoteExpired) {
    await logVendorActivity(assignment.requestId, assignment.vendorId, 'VIEW', 'Ürün listesini görüntüledi.');
  }

  // Limited return for public access — tedarikçi yalnızca satın alma eklerini ve kendi yüklediklerini görür
  const rawAtt = assignment.request.attachments || [];
  const visibleAtt = rawAtt.filter((a) => isVendorVisibleAttachment(a, assignment.vendorId));

  const sortedRequest = await withSortedItems(assignment.request);
  const letterhead = await resolveQuoteLetterhead(sortedRequest);

  const scrubbed = presentProcurementForVendor(
    {
    ...sortedRequest,
    attachments: visibleAtt,
      createdBy: scrubPublicCreator(sortedRequest.createdBy),
    },
    assignment.vendorId
  );

  return {
    ...scrubbed,
    myVendorId: assignment.vendorId,
    vendor: assignment.vendor,
    overallDiscountRate: assignment.overallDiscountRate,
    isShippingIncluded: assignment.isShippingIncluded,
    isVatIncluded: assignment.isVatIncluded,
    vatRate: assignment.vatRate,
    hasMaturity: assignment.hasMaturity,
    maturityDays: assignment.maturityDays,
    usdRateFixed: Boolean(assignment.usdRateFixed),
    usdRate: assignment.usdRate ?? null,
    eurRate: assignment.eurRate ?? null,
    chfRate: assignment.chfRate ?? null,
    quoteNote: assignment.quoteNote ?? null,
    quoteVatIncluded: assignment.isVatIncluded,
    quoteVatRate: assignment.vatRate,
    quoteHasMaturity: assignment.hasMaturity,
    quoteMaturityDays: assignment.maturityDays,
    quoteLockedByDecisionInvite,
    quoteLockedByApproval,
    quoteExpired,
    quoteLockReason,
    tokenExpires: assignment.tokenExpires,
    letterhead,
  };
};

export const noteStaffQuoteAccess = async (token, user) => {
  if (!user || user.role === 'SUPPLIER' || user.isExecutive) return null;
  const assignment = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken: token },
    select: {
      requestId: true,
      vendorId: true,
      vendor: { select: { name: true } },
      request: { select: { title: true } },
    },
  });
  if (!assignment) return null;
  const title = assignment.request?.title || 'Tedarikçi talebi';
  const vendorName = assignment.vendor?.name || 'tedarikçi';
  return recordAudit({
    actorUserId: user.id,
    action: 'STAFF_OPENED_QUOTE_PAGE',
    severity: 'ALERT',
    requestId: assignment.requestId,
    vendorId: assignment.vendorId,
    payload: { vendorName, title },
    notifyMessage: `${user.name}, "${title}" talebinde ${vendorName} teklif sayfasını açtı.`,
    notifyLink: `/procurement/${assignment.requestId}`,
  });
};

export const recordChannelAction = async (requestId, user, { action, vendorId } = {}) => {
  const allowed = ['QUOTE_LINK_COPY', 'QUOTE_LINK_PREVIEW'];
  if (!allowed.includes(action)) {
    const err = new Error('Geçersiz kanal işlemi.');
    err.statusCode = 400;
    throw err;
  }
  const isExec = Boolean(user?.isExecutive);
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { title: true },
  });
  const vendor = vendorId
    ? await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } })
    : null;
  const title = request?.title || 'Tedarikçi talebi';
  const vendorName = vendor?.name || null;
  const verb = action === 'QUOTE_LINK_COPY' ? 'kopyaladı' : 'önizledi';
  const who = user?.name || 'Kullanıcı';
  const detail = vendorName
    ? `"${title}" talebinde ${vendorName} teklif bağlantısını ${verb}.`
    : `"${title}" talebinin tedarikçi teklif bağlantısını ${verb}.`;
  await recordAudit({
    actorUserId: user?.id,
    action,
    severity: isExec ? 'INFO' : 'ALERT',
    requestId,
    vendorId: vendorId || null,
    payload: { executive: isExec, title, vendorName },
    notify: !isExec,
    notifyMessage: isExec ? null : `${who}, ${detail}`,
    notifyLink: `/procurement/${requestId}`,
  });
  return { ok: true };
};

const collectAwardedPriceRows = async (requestId, source = 'COMPLETED') => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      items: {
        include: {
          quotes: true,
          vendorPick: { include: { vendor: true, marketSource: true } },
        },
      },
      marketSources: { include: { quotes: true } },
    },
  });
  if (!request) return [];
  const displayed = attachMarketQuotesForDisplay(request);
  const rows = [];
  for (const item of displayed.items || []) {
    const pick = item.vendorPick;
    const columnId = presentChosenColumnId(pick);
    if (!columnId) continue;
    const quote = (item.quotes || []).find((q) => q.vendorId === columnId);
    if (!quote || quote.price == null) continue;
    const vendorName = quote.isMarket
      ? quote.vendor?.name || marketColumnName(pick?.marketSource) || 'Online'
      : pick?.vendor?.name || 'Tedarikçi';
    rows.push({
      productName: item.productName,
      stockCode: item.stockCode || null,
      vendorName,
      vendorId: isMarketColumnId(columnId) ? null : columnId,
      unitPrice: quote.price,
      currency: quote.currency || 'TRY',
      unit: item.unit || null,
      quantity: item.quantity,
      source,
      requestId,
      itemId: item.id,
    });
  }
  return rows;
};

/** Seçilen kalem fiyatlarını kalıcı görüntüye yazar. Durum güncellemesinden ayrı da çağrılabilir. */
export const snapshotAwardedPrices = async (requestId, source = 'COMPLETED') => {
  const rows = await collectAwardedPriceRows(requestId, source);
  if (!rows.length) return 0;
  await prisma.productPriceSnapshot.createMany({ data: rows });
  return rows.length;
};

export const writePurchaseClose = async (tx, { requestId, fxPatch, snapshotRows, history, fromStatuses = null }) => {
  let updated;
  if (Array.isArray(fromStatuses) && fromStatuses.length) {
    const moved = await tx.procurementRequest.updateMany({
      where: { id: requestId, status: { in: fromStatuses } },
      data: { status: 'COMPLETED', ...fxPatch },
    });
    if (moved.count !== 1) {
      const err = new Error('Bu satın alma zaten tamamlanmış veya artık tamamlanabilir durumda değil.');
      err.statusCode = 409;
      throw err;
    }
    updated = await tx.procurementRequest.findUnique({ where: { id: requestId } });
  } else {
    updated = await tx.procurementRequest.update({
      where: { id: requestId },
      data: { status: 'COMPLETED', ...fxPatch },
    });
  }
  if (snapshotRows.length) {
    await tx.productPriceSnapshot.createMany({ data: snapshotRows });
  }
  await tx.procurementApprovalHistory.create({ data: history });
  return updated;
};

export const submitQuoteByToken = async (token, items, overallDiscountRate, commercialTerms = {}) => {
  const assignment = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken: token },
    include: { vendor: true, request: true }
  });

  assertQuoteLinkWritable(assignment);

  const requestId = assignment.requestId;
  const vendorId = assignment.vendorId;

  await assertQuoteEditableForRequest(requestId);

  const rawFullRequest = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: { items: requestItemsQuery({ quotes: true }) },
  });
  if (!rawFullRequest) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  const fullRequest = await withSortedItems(rawFullRequest);

  items = normalizeSatinAlmaQuoteItems(items, fullRequest.moduleId);
  commercialTerms = normalizeSatinAlmaUsdTerms(commercialTerms, fullRequest.moduleId, items);

  const summaryLines = buildVendorQuoteChangeSummary({
    requestItems: fullRequest.items,
    submittedItems: items,
    vendorId,
    prevOverallDiscount: assignment.overallDiscountRate ?? null,
    newOverallDiscount: overallDiscountRate,
  });

  const logMessage = truncateLogMessage(
    summaryLines.length > 0
      ? `Teklif güncellendi (dış bağlantı): ${summaryLines.join(' | ')}`
      : 'Teklif iletildi — dış bağlantı (kayıtlı değerlerde değişiklik yok).'
  );

  // Run all item quote upserts
  const updatedRequest = await prisma.$transaction(async (tx) => {
    await Promise.all(
      items.map(async (item) => {
        if (item.price === null || item.price === undefined) return;
        
        const existingQuote = await tx.requestItemQuote.findUnique({
          where: { itemId_vendorId: { itemId: item.id, vendorId } }
        });

        if (existingQuote) {
          return tx.requestItemQuote.update({
            where: { id: existingQuote.id },
            data: quoteWriteData(item),
          });
        } else {
          return tx.requestItemQuote.create({
            data: {
              ...quoteWriteData(item),
              itemId: item.id,
              vendorId
            }
          });
        }
      })
    );

    const commercialUpdate = buildAssignmentCommercialUpdate({
      overallDiscountRate,
      ...commercialTerms,
    });
    if (Object.keys(commercialUpdate).length) {
      await tx.requestVendorAssignment.update({
        where: { requestId_vendorId: { requestId, vendorId } },
        data: commercialUpdate,
      });
    }

    await tx.vendorActivityLog.create({
      data: {
        requestId,
        vendorId,
        action: 'SUBMIT',
        message: logMessage,
      },
    });

    return tx.procurementRequest.update({
      where: { id: requestId },
      data: { status: 'VENDOR_QUOTED' },
      include: { items: requestItemsQuery({ quotes: true }) },
    });
  });

  const hadPriorQuotes = (fullRequest.items || []).some((it) =>
    (it.quotes || []).some((q) => q.vendorId === vendorId && q.price != null)
  );
  const pricedSubmitted = (items || []).some((i) => {
    const n = Number(i?.price);
    return i?.price !== null && i?.price !== undefined && i?.price !== '' && Number.isFinite(n);
  });
  if (pricedSubmitted) {
    const overallDiscountChange = hadPriorQuotes
      ? overallDiscountChangeForEmail(assignment.overallDiscountRate ?? null, overallDiscountRate)
      : null;
    const quotedItemsForEmail = buildQuotedItemsForEmail({
      requestItems: fullRequest.items,
      submittedItems: items,
      vendorId,
      isUpdate: hadPriorQuotes,
    });
    const shouldMail =
      !hadPriorQuotes || quotedItemsForEmail.length > 0 || Boolean(overallDiscountChange);
    if (shouldMail) {
      const { sendQuoteNotificationEmail } = await import('../mail/mail.service.js');
      try {
        await sendQuoteNotificationEmail({
          vendorName: assignment.vendor?.name,
          request: {
            id: fullRequest.id,
            title: fullRequest.title,
            moduleId: fullRequest.moduleId,
            createdById: fullRequest.createdById,
          },
          quotedItems: quotedItemsForEmail,
          isUpdate: hadPriorQuotes,
          overallDiscountChange,
        });
      } catch (err) {
        console.error('Quote email error (token):', err?.message || err);
      }
    }
    try {
      await notifyAllQuotesCompleteIfNeeded({
        request: fullRequest,
        itemsBefore: fullRequest.items,
        itemsAfter: updatedRequest.items,
      });
    } catch (err) {
      console.error('All-quotes complete notify (token):', err?.message || err);
    }
  }

  return withSortedItems(updatedRequest);
};

const DECISION_INVITE_DAYS = 14;
/** Bu süre dolana kadar geri alınabilir; süre bitince e-posta gönderilir (öncesinde posta gitmez). */
const DECISION_INVITE_REVOKE_GRACE_MS = 60_000;

const decisionInviteEmailTimers = new Map();

const cancelScheduledDecisionInviteEmail = (inviteId) => {
  const t = decisionInviteEmailTimers.get(inviteId);
  if (t) {
    clearTimeout(t);
    decisionInviteEmailTimers.delete(inviteId);
  }
};

async function flushDecisionInviteEmailSend(inviteId) {
  decisionInviteEmailTimers.delete(inviteId);
  const invite = await prisma.procurementDecisionInvite.findUnique({
    where: { id: inviteId },
    include: { request: { select: { id: true, title: true, moduleId: true } } },
  });
  if (!invite || invite.emailSentAt || invite.resolvedAt) return;
  if (invite.expiresAt < new Date()) return;

  const earliestSend = new Date(invite.createdAt).getTime() + DECISION_INVITE_REVOKE_GRACE_MS;
  if (Date.now() < earliestSend) {
    scheduleDecisionInviteEmailSend(inviteId, earliestSend - Date.now());
    return;
  }

  try {
    const request = await loadRequestForApproval(invite.requestId);
    const decision = await getApprovalDecision(request);
    const limitCfg = await getApprovalLimit();
    const canonical = normalizeExecutiveEmail(limitCfg.executiveEmail);
    const includeCanonical =
      Boolean(canonical) && normalizeExecutiveEmail(invite.email) === canonical;
    const result = await sendOverLimitInboxMailForRequest({
      request,
      decision,
      escalatedByName: moduleLabel(request.moduleId),
      kind: 'PRODUCTION_DECISION',
      extraEmails: invite.extraEmails || [],
      includeCanonical,
    });
    if (result?.reason === 'missing_email') {
      console.error('Production decision inbox email was not sent:', result.reason);
      return;
    }
    if (!result?.sent) {
      console.error('Production decision inbox email was not sent:', result?.reason || 'unknown');
    }
    await prisma.procurementDecisionInvite.update({
      where: { id: inviteId },
      data: { emailSentAt: new Date() },
    });
  } catch (err) {
    console.error('Decision invite email failed:', err?.message || err);
  }
}

function scheduleDecisionInviteEmailSend(inviteId, delayMs) {
  cancelScheduledDecisionInviteEmail(inviteId);
  const ms = Math.max(0, Math.floor(delayMs));
  const t = setTimeout(() => {
    void flushDecisionInviteEmailSend(inviteId);
  }, ms);
  decisionInviteEmailTimers.set(inviteId, t);
}

/** Sunucu yeniden başlayınca bekleyen gönderimleri yeniden zamanlar. */
export const recoverPendingDecisionInviteEmailSends = async () => {
  const pending = await prisma.procurementDecisionInvite.findMany({
    where: { emailSentAt: null, resolvedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, createdAt: true },
  });
  for (const row of pending) {
    const due = new Date(row.createdAt).getTime() + DECISION_INVITE_REVOKE_GRACE_MS;
    scheduleDecisionInviteEmailSend(row.id, Math.max(0, due - Date.now()));
  }
};

export const getByDecisionToken = async (rawToken) => {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Geçersiz bağlantı.');
    err.statusCode = 400;
    throw err;
  }
  const invite = await prisma.procurementDecisionInvite.findUnique({
    where: { token: rawToken.trim() },
  });
  if (!invite) {
    const err = new Error('Davet bağlantısı geçersiz veya süresi dolmuş.');
    err.statusCode = 404;
    throw err;
  }
  if (invite.expiresAt < new Date()) {
    const err = new Error('Davet bağlantısının süresi dolmuş.');
    err.statusCode = 410;
    throw err;
  }
  if (!invite.emailSentAt) {
    const err = new Error('Bu davet henüz yöneticiye e-posta ile gönderilmedi veya iptal edildi.');
    err.statusCode = 403;
    throw err;
  }
  const request = await getById(invite.requestId);
  const inboxEmail = normalizeExecutiveEmail(invite.email);
  let inboxToken = null;
  if (inboxEmail) {
    const access = await getOrCreateOverLimitTokenForToday(inboxEmail);
    inboxToken = access.token;
  }
  return {
    request,
    invite: {
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
    inboxToken,
    requestId: request.id,
  };
};

export const upsertItemVendorPicksByDecisionToken = async (rawToken, choices) => {
  if (!rawToken || typeof rawToken !== 'string') {
    const err = new Error('Geçersiz bağlantı.');
    err.statusCode = 400;
    throw err;
  }
  const invite = await prisma.procurementDecisionInvite.findUnique({
    where: { token: rawToken.trim() },
    include: { request: { select: { id: true, createdById: true } } },
  });
  if (!invite) {
    const err = new Error('Davet bağlantısı geçersiz veya süresi dolmuş.');
    err.statusCode = 404;
    throw err;
  }
  if (invite.expiresAt < new Date()) {
    const err = new Error('Davet bağlantısının süresi dolmuş.');
    err.statusCode = 410;
    throw err;
  }
  if (!invite.emailSentAt) {
    const err = new Error('Bu davet henüz yöneticiye e-posta ile gönderilmedi veya iptal edildi.');
    err.statusCode = 403;
    throw err;
  }
  const actingUserId = invite.request.createdById;
  return upsertItemVendorPicks(invite.requestId, actingUserId, choices);
};

const assertDecisionInviteSender = (actor, moduleId) => {
  if (!actor || actor.role === 'ADMIN' || actor.isExecutive) return;
  if (
    actor.role === 'PURCHASING' &&
    (moduleId || MODULE.URETIM) === MODULE.URETIM &&
    actor.subRole !== 'MANAGER'
  ) {
    throw forbid('Satın alma karar davetini yalnızca birim yetkilisi gönderebilir.', 403);
  }
};

export const createDecisionInvite = async (
  requestId,
  createdById,
  extraEmails = [],
  includeCanonical = true,
  actor = null,
) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, title: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (isHandedToSatinAlma(request) && actor && actor.role !== 'ADMIN') {
    throw forbid('Satın alma sorumluluğu Satın Alma departmanına devredildi. Karar daveti bu talepten gönderilmez.', 403);
  }
  if (
    actor &&
    actor.role !== 'ADMIN' &&
    (request.moduleId || MODULE.URETIM) !== (actor.moduleId || MODULE.URETIM)
  ) {
    throw forbid('Bu talebe erişim yetkiniz yok (Farklı Modül).', 403);
  }
  if (!usesExecutiveDecisionInvite(request.moduleId)) {
    const err = new Error(
      'Karar daveti yalnızca üretim ve yedek parça talepleri için üst yönetim kutusuna gönderilir.',
    );
    err.statusCode = 403;
    throw err;
  }
  assertDecisionInviteSender(actor, request.moduleId);

  const limitCfg = await getApprovalLimit();
  const canonical = normalizeExecutiveEmail(limitCfg.executiveEmail);
  const extras = await resolveExtraCcEmails(extraEmails, canonical);
  const sendCanonical = includeCanonical !== false;
  if (sendCanonical && !canonical && !extras.length) {
    const err = new Error(
      'Üst yönetim e-postası (onay limiti ayarı) tanımlı değil. Ayarlardan executive e-postasını girin.',
    );
    err.statusCode = 400;
    throw err;
  }
  const recipients = [...(sendCanonical && canonical ? [canonical] : []), ...extras];
  if (!recipients.length) {
    const err = new Error('En az bir alıcı seçin.');
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  const blocking = await prisma.procurementDecisionInvite.findFirst({
    where: { requestId, expiresAt: { gt: now }, resolvedAt: null },
  });
  if (blocking) {
    if (!blocking.emailSentAt) {
    const err = new Error(
        'Bu talep için zaten geçerli bir karar daveti var. Yeni göndermeden önce mevcut daveti 1 dakika içinde geri alın veya süresinin dolmasını bekleyin.',
    );
    err.statusCode = 409;
    throw err;
    }
    await prisma.procurementDecisionInvite.update({
      where: { id: blocking.id },
      data: {
        email: recipients[0],
        extraEmails: extras,
        expiresAt: new Date(Date.now() + DECISION_INVITE_DAYS * 24 * 60 * 60 * 1000),
      },
    });
    const full = await loadRequestForApproval(requestId);
    const decision = await getApprovalDecision(full);
    const result = await sendOverLimitInboxMailForRequest({
      request: full,
      decision,
      escalatedByName: moduleLabel(request.moduleId),
      kind: 'PRODUCTION_DECISION',
      extraEmails: extras,
      includeCanonical: sendCanonical && Boolean(canonical),
    });
    if (!result?.sent) {
      const err = new Error(
        'E-posta tekrar gönderilemedi. Mail ayarlarını kontrol edin veya biraz sonra deneyin.',
      );
      err.statusCode = 502;
      throw err;
    }
    await prisma.procurementApprovalHistory.create({
      data: {
        requestId,
        actorUserId: createdById || null,
        action: 'DECISION_INVITE_RESENT',
        note: 'Üst yönetime teklif kararı daveti yeniden gönderildi.',
      },
    });
    return {
      ok: true,
      resent: true,
      expiresAt: new Date(Date.now() + DECISION_INVITE_DAYS * 24 * 60 * 60 * 1000),
      sentTo: sendCanonical ? canonical : null,
      extraEmails: extras,
      includeCanonical: sendCanonical && Boolean(canonical),
    };
  }

  await prisma.procurementDecisionInvite.deleteMany({
    where: { requestId, expiresAt: { lte: now } },
  });

  const token = generateToken();
  const expiresAt = new Date(Date.now() + DECISION_INVITE_DAYS * 24 * 60 * 60 * 1000);

  const created = await prisma.procurementDecisionInvite.create({
    data: {
      token,
      email: recipients[0],
      requestId,
      expiresAt,
      createdById,
      extraEmails: extras,
    },
  });

  scheduleDecisionInviteEmailSend(created.id, DECISION_INVITE_REVOKE_GRACE_MS);

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: createdById || null,
      action: 'DECISION_INVITE_SENT',
      note: 'Üst yönetime teklif kararı daveti iletildi (1 dakika içinde geri alınabilir).',
    },
  });

  const mailDispatchesAt = new Date(
    new Date(created.createdAt).getTime() + DECISION_INVITE_REVOKE_GRACE_MS
  ).toISOString();

  return {
    ok: true,
    expiresAt: created.expiresAt,
    sentTo: sendCanonical ? canonical : null,
    extraEmails: extras,
    includeCanonical: sendCanonical && Boolean(canonical),
    mailDispatchesAt,
  };
};

/** Satın alma kuyruğundaki talebe üst yönetim kutusunu tekrar mail at (süresi dolan token için yeni link). */
export const resendExecutiveInbox = async (
  requestId,
  actor,
  extraEmails = [],
  includeCanonical = true,
) => {
  if (actor?.role !== 'ADMIN' && actor?.role !== 'PURCHASING') {
    const err = new Error('Bu işlem için yetkiniz yok.');
    err.statusCode = 403;
    throw err;
  }
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, title: true, moduleId: true, purchasingResponsibleModuleId: true, status: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  if (!usesSatinAlmaApprovalChain(request)) {
    assertDecisionInviteSender(actor, request.moduleId);
  }
  if (usesSatinAlmaApprovalChain(request)) {
    if (request.status !== 'PENDING_ADMIN_APPROVAL') {
      const err = new Error('Bu talep üst yönetim kuyruğunda değil.');
      err.statusCode = 409;
      throw err;
    }
    const canonical = normalizeExecutiveEmail((await getApprovalLimit()).executiveEmail);
    const extras = await resolveExtraCcEmails(extraEmails, canonical);
    const sendCanonical = includeCanonical !== false;
    const recipients = [...(sendCanonical && canonical ? [canonical] : []), ...extras];
    if (!recipients.length) {
      const err = new Error('En az bir alıcı seçin.');
      err.statusCode = 400;
      throw err;
    }
    const full = await loadRequestForApproval(requestId);
    const decision = await getApprovalDecision(full);
    const result = await sendOverLimitInboxMailForRequest({
      request: full,
      decision,
      escalatedByName: actor.name || 'Satın alma',
      extraEmails: extras,
      includeCanonical: sendCanonical && Boolean(canonical),
    });
    if (!result?.sent) {
      const err = new Error(
        'E-posta tekrar gönderilemedi. Mail ayarlarını kontrol edin veya biraz sonra deneyin.',
      );
      err.statusCode = 502;
      throw err;
    }
    return {
      ok: true,
      resent: true,
      sentTo: sendCanonical ? canonical : null,
      extraEmails: extras,
      includeCanonical: sendCanonical && Boolean(canonical),
    };
  }
  return createDecisionInvite(requestId, actor.id, extraEmails, includeCanonical);
};

/**
 * E-posta henüz gönderilmediyse daveti iptal eder; yöneticiye mail gitmez.
 */
export const revokeLatestDecisionInviteGrace = async (requestId, actor = null) => {
  if (actor) {
    const request = await prisma.procurementRequest.findUnique({
      where: { id: requestId },
      select: { moduleId: true, purchasingResponsibleModuleId: true },
    });
    if (request && isHandedToSatinAlma(request)) assertSameModuleWriter(request, actor);
    else if (request) assertDecisionInviteSender(actor, request.moduleId);
  }
  const invite = await prisma.procurementDecisionInvite.findFirst({
    where: { requestId },
    orderBy: { createdAt: 'desc' },
  });
  if (!invite) {
    const err = new Error('Geri alınacak davet bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (invite.emailSentAt) {
    const err = new Error('Yöneticiye e-posta zaten iletildi; bu aşamada geri alma yapılamaz.');
    err.statusCode = 410;
    throw err;
  }
  const ageMs = Date.now() - new Date(invite.createdAt).getTime();
  if (ageMs > DECISION_INVITE_REVOKE_GRACE_MS) {
    const err = new Error('Geri alma süresi (1 dakika) doldu.');
    err.statusCode = 410;
    throw err;
  }

  cancelScheduledDecisionInviteEmail(invite.id);

  const deleted = await prisma.procurementDecisionInvite.deleteMany({
    where: { id: invite.id, emailSentAt: null },
  });
  if (deleted.count === 0) {
    const cur = await prisma.procurementDecisionInvite.findUnique({ where: { id: invite.id } });
    if (!cur) return { ok: true };
    if (cur.emailSentAt) {
      const err = new Error('Yöneticiye e-posta zaten iletildi; bu aşamada geri alma yapılamaz.');
      err.statusCode = 410;
      throw err;
    }
    const err = new Error('Geri alma süresi (1 dakika) doldu.');
    err.statusCode = 410;
    throw err;
  }

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: invite.createdById || null,
      action: 'DECISION_INVITE_REVOKED',
      note: 'Üst yönetim karar daveti 1 dakika içinde geri alındı; e-posta gitmedi.',
    },
  });

  return { ok: true };
};

export const assertAttachmentUploadAllowed = async (requestId, actor) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  return request;
};

export const assertInvoiceUploadAllowed = async (requestId, actor) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  if (request.status !== 'COMPLETED') {
    const err = new Error('Fatura yalnızca satın alma tamamlandıktan sonra yüklenebilir.');
    err.statusCode = 409;
    throw err;
  }
  return request;
};

export const assertMarketUploadAllowed = async (requestId, actor) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  assertCanEditMarketOffers(request, actor);
  return request;
};

export const assertVendorTokenUploadAllowed = async (token) => {
  const assignment = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken: token },
    select: {
      requestId: true,
      vendorId: true,
      tokenExpires: true,
      request: { select: { status: true } },
    },
  });
  assertQuoteLinkWritable(assignment);
  return assignment;
};

/** Çoklu dosya yükleme — path göreli (cwd) saklanır. itemId ile kalem kapsamı. */
export const addAttachmentsFromUpload = async (
  requestId,
  files,
  { itemId = null, marketSourceId = null, actor = null } = {}
) => {
  const request = await prisma.procurementRequest.findUnique({ where: { id: requestId } });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);

  let resolvedItemId = null;
  if (itemId) {
    const item = await prisma.requestItem.findFirst({
      where: { id: String(itemId), requestId },
      select: { id: true },
    });
    if (!item) {
      const err = new Error('Seçilen kalem bu talebe ait değil.');
      err.statusCode = 400;
      throw err;
    }
    resolvedItemId = item.id;
  }

  let resolvedMarketSourceId = null;
  if (marketSourceId) {
    const src = await prisma.requestMarketSource.findFirst({
      where: { id: String(marketSourceId), requestId },
      select: { id: true },
    });
    if (!src) {
      const err = new Error('Online piyasa kaydı bu talebe ait değil.');
      err.statusCode = 400;
      throw err;
    }
    resolvedMarketSourceId = src.id;
  }

  if (!files?.length) return [];
  const out = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), file.path).replace(/\\/g, '/');
    const row = await prisma.attachment.create({
      data: {
        requestId,
        vendorId: null,
        itemId: resolvedItemId,
        marketSourceId: resolvedMarketSourceId,
        kind: 'GENERAL',
        filename: path.basename(file.path),
        originalName: decodeMultipartOriginalName(file.originalname) || file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
        path: rel,
      },
      include: {
        item: { select: { id: true, productName: true } },
      },
    });
    out.push({
      id: row.id,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
      createdAt: row.createdAt,
      vendorId: null,
      itemId: row.itemId,
      marketSourceId: row.marketSourceId,
      kind: row.kind,
      item: row.item,
    });
  }
  return out;
};

const assertCanEditMarketOffers = (request, actor, {
  forbidden = 'Online piyasa fiyatı ekleme yetkiniz yok.',
  locked = 'Bu aşamada online piyasa fiyatı eklenemez veya değiştirilemez.',
} = {}) => {
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  if (actor?.role !== 'ADMIN' && actor?.role !== 'PURCHASING') {
    throw forbid(forbidden, 403);
  }
  if (actor?.role !== 'ADMIN') {
    if ((actor.moduleId || '') !== purchasingModuleOf(request)) {
      throw forbid('Bu talebe erişim yetkiniz yok (Farklı Modül).', 403);
    }
  }
  if (!MARKET_EDITABLE_STATUSES.has(request.status)) {
    const err = new Error(locked);
    err.statusCode = 409;
    throw err;
  }
};

const assertNoOpenDecisionInvite = async (requestId) => {
  const invite = await prisma.procurementDecisionInvite.findFirst({
    where: activeDecisionInviteWhere(requestId),
    select: { id: true },
  });
  if (!invite) return;
  const err = new Error('Üst yönetim karar daveti açıkken teklif silinemez.');
  err.statusCode = 409;
  throw err;
};

const logQuoteRemovalHistory = async ({ requestId, actor, action, note, vendorId, vendorMessage }) => {
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor?.id || null,
      action,
      note,
    },
  });
  if (vendorId && vendorMessage) {
    await logVendorActivity(requestId, vendorId, 'STAFF_DELETE', vendorMessage);
  }
};

const parseMarketPrice = (raw) => {
  const n = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error('Geçerli bir fiyat girin.');
    err.statusCode = 400;
    throw err;
  }
  return n;
};

const parseMarketCurrency = (raw) => {
  const c = String(raw || 'TRY').trim().toUpperCase();
  if (c !== 'TRY' && c !== 'USD' && c !== 'EUR' && c !== 'CHF') {
    const err = new Error('Para birimi TRY, USD, EUR veya CHF olmalıdır.');
    err.statusCode = 400;
    throw err;
  }
  return c;
};

const parseMarketChannel = (raw) => {
  const c = String(raw || '').trim().toUpperCase();
  if (!MARKET_CHANNELS.includes(c)) {
    const err = new Error('Pazar yeri seçin (Trendyol, Hepsiburada, n11, Amazon veya Diğer).');
    err.statusCode = 400;
    throw err;
  }
  return c;
};

const loadMarketRequestOrThrow = async (requestId) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, status: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  return request;
};

const requireItemOnRequest = async (requestId, itemId) => {
  const item = await prisma.requestItem.findFirst({
    where: { id: String(itemId || ''), requestId },
    select: { id: true },
  });
  if (!item) {
    const err = new Error('Seçilen kalem bu talebe ait değil.');
    err.statusCode = 400;
    throw err;
  }
  return item.id;
};

/** Personel pazar araştırması: kaynak + kalem fiyatı (+ ekran görüntüsü). */
export const upsertMarketOffer = async (requestId, actor, body = {}, files = []) => {
  const request = await loadMarketRequestOrThrow(requestId);
  assertCanEditMarketOffers(request, actor);

  const itemId = await requireItemOnRequest(requestId, body.itemId);
  const price = parseMarketPrice(body.price);
  const currency = parseMarketCurrency(body.currency);
  const itemUrl = body.itemUrl != null && String(body.itemUrl).trim() ? parseHttpUrl(body.itemUrl) : null;
  if (body.itemUrl != null && String(body.itemUrl).trim() && !itemUrl) {
    const err = new Error('Kalem linki geçerli bir http(s) adresi olmalıdır.');
    err.statusCode = 400;
    throw err;
  }
  const itemNotes = body.itemNotes != null ? String(body.itemNotes).trim() || null : null;
  const existingSourceId = body.sourceId ? String(body.sourceId).trim() : '';

  let source;
  if (existingSourceId) {
    source = await prisma.requestMarketSource.findFirst({
      where: { id: existingSourceId, requestId },
    });
    if (!source) {
      const err = new Error('Online piyasa sütunu bulunamadı.');
      err.statusCode = 404;
      throw err;
    }
  } else {
    const channel = parseMarketChannel(body.channel);
    const sellerName = String(body.sellerName || '').trim();
    if (!sellerName) {
      const err = new Error('Satıcı / mağaza adını yazın.');
      err.statusCode = 400;
      throw err;
    }
    const url = parseHttpUrl(body.url);
    if (!url) {
      const err = new Error('İlan linki geçerli bir http(s) adresi olmalıdır.');
      err.statusCode = 400;
      throw err;
    }
    const notes = body.notes != null ? String(body.notes).trim() || null : null;
    const sellerKey = sellerName.slice(0, 200);
    source = await prisma.requestMarketSource.findFirst({
      where: {
        requestId,
        channel,
        sellerName: { equals: sellerKey, mode: 'insensitive' },
      },
    });
    if (!source) {
      source = await prisma.requestMarketSource.create({
        data: {
          requestId,
          createdById: actor.id,
          channel,
          sellerName: sellerKey,
          url,
          notes,
        },
      });
    }
  }

  const quoteUrl = itemUrl || parseHttpUrl(body.url) || source.url;
  await prisma.requestMarketQuote.upsert({
    where: { sourceId_itemId: { sourceId: source.id, itemId } },
    create: {
      sourceId: source.id,
      itemId,
      price,
      currency,
      url: quoteUrl,
      notes: itemNotes,
    },
    update: {
      price,
      currency,
      url: quoteUrl || undefined,
      notes: itemNotes,
    },
  });

  if (files?.length) {
    await addAttachmentsFromUpload(requestId, files, {
      itemId,
      marketSourceId: source.id,
      actor,
    });
  }

  return getById(requestId, actor);
};

export const updateMarketQuote = async (requestId, quoteId, actor, body = {}) => {
  const request = await loadMarketRequestOrThrow(requestId);
  assertCanEditMarketOffers(request, actor);

  const existing = await prisma.requestMarketQuote.findFirst({
    where: { id: String(quoteId || ''), source: { requestId } },
    include: { source: { select: { id: true, url: true } } },
  });
  if (!existing) {
    const err = new Error('Online fiyat bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const data = {};
  if (body.price !== undefined) data.price = parseMarketPrice(body.price);
  if (body.currency !== undefined) data.currency = parseMarketCurrency(body.currency);
  if (body.notes !== undefined) data.notes = String(body.notes || '').trim() || null;
  if (body.url !== undefined) {
    const url = String(body.url || '').trim() ? parseHttpUrl(body.url) : existing.source.url;
    if (String(body.url || '').trim() && !parseHttpUrl(body.url)) {
      const err = new Error('Link geçerli bir http(s) adresi olmalıdır.');
      err.statusCode = 400;
      throw err;
    }
    data.url = url;
  }

  await prisma.requestMarketQuote.update({ where: { id: existing.id }, data });
  return getById(requestId, actor);
};

export const deleteMarketQuote = async (requestId, quoteId, actor) => {
  const request = await loadMarketRequestOrThrow(requestId);
  assertCanEditMarketOffers(request, actor);
  await assertNoOpenDecisionInvite(requestId);

  const existing = await prisma.requestMarketQuote.findFirst({
    where: { id: String(quoteId || ''), source: { requestId } },
    include: {
      item: { select: { id: true, productName: true } },
      source: { select: { id: true, sellerName: true, channel: true } },
    },
  });
  if (!existing) {
    const err = new Error('Online fiyat bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const itemName = String(existing.item?.productName || 'Kalem').trim() || 'Kalem';
  const seller = String(existing.source?.sellerName || '').trim();
  const channel = marketChannelLabel(existing.source?.channel);
  const sourceLabel = seller ? `${channel} · ${seller}` : channel;
  const priceLabel = formatQuotePriceLabel(existing.price, existing.currency);
  const actorName = String(actor?.name || 'Satın alma').trim() || 'Satın alma';

  await prisma.requestMarketQuote.delete({ where: { id: existing.id } });
  await prisma.requestItemVendorPick.updateMany({
    where: {
      requestId,
      itemId: existing.itemId,
      chosenMarketSourceId: existing.sourceId,
    },
    data: { chosenMarketSourceId: null },
  });
  const leftover = await prisma.requestMarketQuote.count({ where: { sourceId: existing.sourceId } });
  if (leftover === 0) {
    await prisma.requestMarketSource.delete({ where: { id: existing.sourceId } });
  }

  await logQuoteRemovalHistory({
    requestId,
    actor,
    action: 'MARKET_QUOTE_REMOVED',
    note: `${actorName}, «${itemName}» kalemindeki online fiyatı sildi (${sourceLabel}, ${priceLabel}).`,
  });

  return getById(requestId, actor);
};

export const deleteItemQuote = async (requestId, quoteId, actor) => {
  const request = await loadMarketRequestOrThrow(requestId);
  assertCanEditMarketOffers(request, actor, {
    forbidden: 'Tedarikçi teklifi silme yetkiniz yok.',
    locked: 'Bu aşamada tedarikçi teklifi silinemez.',
  });
  await assertNoOpenDecisionInvite(requestId);

  const existing = await prisma.requestItemQuote.findFirst({
    where: { id: String(quoteId || ''), item: { requestId } },
    include: {
      item: { select: { id: true, productName: true } },
      vendor: { select: { id: true, name: true } },
    },
  });
  if (!existing) {
    const err = new Error('Tedarikçi teklifi bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const itemName = String(existing.item?.productName || 'Kalem').trim() || 'Kalem';
  const vendorName = String(existing.vendor?.name || 'Tedarikçi').trim() || 'Tedarikçi';
  const priceLabel = formatQuotePriceLabel(existing.price, existing.currency);
  const actorName = String(actor?.name || 'Satın alma').trim() || 'Satın alma';

  await prisma.$transaction([
    prisma.requestItemQuote.delete({ where: { id: existing.id } }),
    prisma.requestItemVendorPick.updateMany({
      where: {
        requestId,
        itemId: existing.itemId,
        chosenVendorId: existing.vendorId,
      },
      data: { chosenVendorId: null },
    }),
  ]);

  await logQuoteRemovalHistory({
    requestId,
    actor,
    action: 'VENDOR_QUOTE_REMOVED',
    note: `${actorName}, «${itemName}» kalemindeki ${vendorName} teklifini sildi (${priceLabel}).`,
    vendorId: existing.vendorId,
    vendorMessage: `${actorName} «${itemName}» kalemindeki teklifi sildi (${priceLabel}).`,
  });

  return getById(requestId, actor);
};

const ITEM_RENAME_LOCKED = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);

/** Satın alma ekibi kalem adını düzeltir. Eski ve yeni ad onay geçmişine yazılır. */
export const renameRequestItem = async (requestId, itemId, actor, productName) => {
  const request = await loadMarketRequestOrThrow(requestId);
  if ((request.moduleId || '') !== 'SATIN_ALMA') {
    throw forbid('Kalem adı yalnızca satın alma taleplerinde değiştirilebilir.', 403);
  }
  const isAdmin = actor?.role === 'ADMIN';
  const isSatinAlmaStaff =
    actor?.role === 'PURCHASING' && (actor.moduleId || '') === 'SATIN_ALMA';
  if (!isAdmin && !isSatinAlmaStaff) {
    throw forbid('Kalem adını yalnızca satın alma ekibi değiştirebilir.', 403);
  }
  if (ITEM_RENAME_LOCKED.has(request.status)) {
    const err = new Error('Bu aşamada kalem adı değiştirilemez.');
    err.statusCode = 409;
    throw err;
  }

  const next = String(productName ?? '').trim().replace(/\s+/g, ' ');
  if (next.length < 2 || next.length > 300) {
    const err = new Error('Kalem adı 2–300 karakter olmalıdır.');
    err.statusCode = 400;
    throw err;
  }

  const item = await prisma.requestItem.findFirst({
    where: { id: String(itemId || ''), requestId },
    select: { id: true, productName: true },
  });
  if (!item) {
    const err = new Error('Kalem bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const prev = String(item.productName || '').trim();
  if (prev === next) return getById(requestId, actor);

  const actorName = String(actor?.name || 'Satın alma').trim() || 'Satın alma';
  await prisma.requestItem.update({
    where: { id: item.id },
    data: { productName: next },
  });
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor?.id || null,
      action: 'ITEM_RENAMED',
      note: `${actorName}, kalem adını «${prev}» iken «${next}» olarak değiştirdi.`,
    },
  });

  return getById(requestId, actor);
};

export const deleteMarketSource = async (requestId, sourceId, actor) => {
  const request = await loadMarketRequestOrThrow(requestId);
  assertCanEditMarketOffers(request, actor);

  const existing = await prisma.requestMarketSource.findFirst({
    where: { id: String(sourceId || ''), requestId },
    select: { id: true },
  });
  if (!existing) {
    const err = new Error('Online piyasa sütunu bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  await prisma.requestMarketSource.delete({ where: { id: existing.id } });
  return getById(requestId, actor);
};

/** Teklif token ile tedarikçi dosya yükler. itemId boşsa tüm teklife, doluysa kaleme bağlanır. */
export const addVendorAttachmentsFromUpload = async (quoteToken, files, { itemId = null } = {}) => {
  const assignment = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken },
    select: {
      requestId: true,
      vendorId: true,
      tokenExpires: true,
      request: { select: { status: true } },
    },
  });
  assertQuoteLinkWritable(assignment);
  const requestId = assignment.requestId;
  const vendorId = assignment.vendorId;
  if (!files?.length) return [];

  let resolvedItemId = null;
  if (itemId) {
    const item = await prisma.requestItem.findFirst({
      where: { id: String(itemId), requestId },
      select: { id: true },
    });
    if (!item) {
      const err = new Error('Seçilen kalem bu talebe ait değil.');
      err.statusCode = 400;
      throw err;
    }
    resolvedItemId = item.id;
  }

  const destDir = path.join(process.cwd(), 'uploads', 'procurement', requestId);
  fssync.mkdirSync(destDir, { recursive: true });

  const out = [];
  for (const file of files) {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.path) || ''}`;
    const finalAbs = path.join(destDir, unique);
    try {
      await fs.rename(file.path, finalAbs);
    } catch {
      await fs.copyFile(file.path, finalAbs);
      try {
        await fs.unlink(file.path);
      } catch {
        // ignore
      }
    }
    const rel = path.relative(process.cwd(), finalAbs).replace(/\\/g, '/');
    try {
      const row = await prisma.attachment.create({
        data: {
          requestId,
          vendorId,
          itemId: resolvedItemId,
          kind: 'GENERAL',
          filename: path.basename(finalAbs),
          originalName: decodeMultipartOriginalName(file.originalname) || file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          path: rel,
        },
        include: {
          item: { select: { id: true, productName: true } },
          vendor: { select: { id: true, name: true } },
        },
      });
      out.push({
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        createdAt: row.createdAt,
        vendorId: row.vendorId,
        itemId: row.itemId,
        kind: row.kind,
        item: row.item,
        vendor: row.vendor,
      });
    } catch (err) {
      await fs.unlink(finalAbs).catch(() => {});
      throw err;
    }
  }
  await logVendorActivity(
    requestId,
    vendorId,
    'UPLOAD',
    resolvedItemId
      ? `${files.length} ek dosya yüklendi (kalem).`
      : `${files.length} ek dosya yüklendi (tüm teklif).`,
  );
  return out;
};

export const resolveAttachmentAbsolutePath = (att) => {
  const p = att.path;
  if (path.isAbsolute(p)) return p;
  return path.join(process.cwd(), p);
};

export const getAttachmentForRequest = async (requestId, attachmentId) => {
  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, requestId },
  });
  if (!att) {
    const err = new Error('Dosya bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  return att;
};

export const assertUserCanAccessRequestFiles = async (user, requestId) => {
  if (user.role === 'ADMIN' || user.role === 'PURCHASING') return;
  if (user.role === 'SUPPLIER') {
    const vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
    if (!vendor) {
      const err = new Error('Yetkisiz');
      err.statusCode = 403;
      throw err;
    }
    const a = await prisma.requestVendorAssignment.findFirst({
      where: { requestId, vendorId: vendor.id },
    });
    if (!a) {
      const err = new Error('Bu talebe erişiminiz yok.');
      err.statusCode = 403;
      throw err;
    }
    return;
  }
  const err = new Error('Yetkisiz');
  err.statusCode = 403;
  throw err;
};

export const assertAttachmentDownloadAllowed = async (user, att) => {
  if (user.role === 'ADMIN' || user.role === 'PURCHASING') return;
  if (user.role === 'SUPPLIER') {
    if (att.kind === 'INVOICE' || att.marketSourceId) {
      const err = new Error('Bu dosyaya erişiminiz yok.');
      err.statusCode = 403;
      throw err;
    }
    await assertUserCanAccessRequestFiles(user, att.requestId);
    if (att.vendorId) {
      const vendor = await prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!vendor || vendor.id !== att.vendorId) {
        const err = new Error('Bu dosyaya erişiminiz yok.');
        err.statusCode = 403;
        throw err;
      }
    }
    return;
  }
  const err = new Error('Yetkisiz');
  err.statusCode = 403;
  throw err;
};

export const getAttachmentForQuoteToken = async (quoteToken, attachmentId) => {
  const assignment = await prisma.requestVendorAssignment.findUnique({
    where: { quoteToken },
  });
  if (!assignment) {
    const err = new Error('Geçersiz bağlantı.');
    err.statusCode = 404;
    throw err;
  }
  const att = await getAttachmentForRequest(assignment.requestId, attachmentId);
  if (!isVendorVisibleAttachment(att, assignment.vendorId)) {
    const err = new Error('Bu dosyaya bu bağlantıyla erişilemez.');
    err.statusCode = 403;
    throw err;
  }
  return att;
};

/** Üst yönetim onay kutusu — fatura hariç talep ekleri (+ bağlı birim talebi ekleri). */
export const getAttachmentForOverLimitToken = async (rawToken, requestId, attachmentId) => {
  const access = await resolveOverLimitAccess(rawToken);
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      moduleId: true,
      sourceInternalRequest: { select: { id: true } },
    },
  });
  if (!request) {
    const err = new Error('Bu talep onay kutusunda değil.');
    err.statusCode = 404;
    throw err;
  }
  try {
    await assertInExecutiveInbox(request);
    await assertTokenMayAccessRequest(access, request);
  } catch {
    const err = new Error('Bu talep onay kutusunda değil.');
    err.statusCode = 404;
    throw err;
  }

  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, requestId },
  });
  if (att) {
    if (att.kind === 'INVOICE') {
      const err = new Error('Bu dosyaya erişilemez.');
    err.statusCode = 403;
    throw err;
  }
  return att;
  }

  const internalId = request.sourceInternalRequest?.id;
  if (internalId) {
    const unitAtt = await prisma.internalRequestAttachment.findFirst({
      where: { id: attachmentId, requestId: internalId },
    });
    if (unitAtt) {
      return {
        id: unitAtt.id,
        originalName: unitAtt.originalName,
        mimeType: unitAtt.mimeType,
        size: unitAtt.size,
        path: unitAtt.storedPath,
        kind: 'UNIT',
      };
    }
  }

  const err = new Error('Dosya bulunamadı.');
  err.statusCode = 404;
  throw err;
};

// ─── Satın Alma Onay Akışı & Limit Hizmetleri ─────────────────────────────
//
// Hiyerarşi:
//   1) Personel talebi hazırlar, tedarikçilere gönderir              → SENT_TO_VENDOR
//   2) Tedarikçi fiyatları doldurur                                   → VENDOR_QUOTED
//   3) Personel teklifleri Satın Alma Birimi Yetkilisine iletir       → PENDING_MANAGER_APPROVAL
//   4) Yetkili onaylar; seçilen tekliflerin TL karşılığı parasal onay
//      limitini AŞIYORSA yetkili tek başına onaylayamaz, kayıt üst
//      yönetim onayına yükseltilir                                    → PENDING_ADMIN_APPROVAL
//      Limit altındaysa / üst yönetim onaylarsa satın alma birimine   → APPROVED_FOR_PURCHASE
//      Onaylanmazsa personele iade edilir                             → VENDOR_QUOTED

const APPROVAL_LIMIT_DEFAULTS = { limitAmount: 250000, isActive: true, moduleId: 'SATIN_ALMA' };

const APPROVAL_REQUEST_INCLUDE = {
  assignments: { include: { vendor: { select: { id: true, name: true, city: true } } } },
  itemVendorPicks: true,
  items: { include: { quotes: true, vendorPick: true } },
  marketSources: {
    include: {
      quotes: true,
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  createdBy: { select: { id: true, name: true, email: true, role: true, subRole: true, moduleId: true } },
  assignedTo: { select: { id: true, name: true, email: true, role: true, subRole: true } },
  sourceInternalRequest: {
    select: {
      id: true,
      requesterUnit: true,
      description: true,
      reviewNote: true,
      neededBy: true,
      createdBy: { select: { id: true, name: true } },
    },
  },
};

/** Üst onay kartı için fatura dışı ekler (itemId eski client’ta yoksa raw). */
const loadAttachmentsForApprovalCard = async (requestId) => {
  const rows = await prisma.$queryRaw`
    SELECT
      a.id,
      a."originalName" AS "originalName",
      a."mimeType" AS "mimeType",
      a.size,
      a."createdAt" AS "createdAt",
      a."vendorId" AS "vendorId",
      a."itemId" AS "itemId",
      a."marketSourceId" AS "marketSourceId",
      a.kind,
      v.id AS "vendorRelId",
      v.name AS "vendorName",
      i.id AS "itemRelId",
      i."productName" AS "itemProductName"
    FROM attachments a
    LEFT JOIN vendors v ON v.id = a."vendorId"
    LEFT JOIN request_items i ON i.id = a."itemId"
    WHERE a."requestId" = ${requestId}
      AND (a.kind IS NULL OR a.kind <> 'INVOICE')
    ORDER BY a."createdAt" ASC
  `;
  return (rows || []).map((r) => ({
    id: r.id,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: Number(r.size) || 0,
    createdAt: r.createdAt,
    vendorId: r.vendorId,
    itemId: r.itemId,
    marketSourceId: r.marketSourceId || null,
    kind: r.kind || 'GENERAL',
    vendor: r.vendorRelId ? { id: r.vendorRelId, name: r.vendorName } : null,
    item: r.itemRelId ? { id: r.itemRelId, productName: r.itemProductName } : null,
  }));
};

/** Birim iç talebindeki foto / belge ekleri (üst onay kutusu). */
const loadUnitAttachmentsForApprovalCard = async (internalRequestId) => {
  if (!internalRequestId) return [];
  const rows = await prisma.internalRequestAttachment.findMany({
    where: {
      requestId: internalRequestId,
      messageId: null,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      kind: true,
      createdAt: true,
    },
  });
  return (rows || []).map((r) => ({
    id: r.id,
    originalName: r.originalName,
    mimeType: r.mimeType,
    size: Number(r.size) || 0,
    createdAt: r.createdAt,
    kind: r.kind || 'FILE',
    source: 'UNIT',
    vendorId: null,
    itemId: null,
    vendor: null,
    item: null,
  }));
};

const loadRequestForApproval = async (requestId) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: APPROVAL_REQUEST_INCLUDE,
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  return request;
};

const formatMoney = (amount, currency = 'TL') =>
  `${Number(amount || 0).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;

/** Geçersiz durum geçişlerini 409 ile durdurur; mesaj kullanıcıya aynen gösterilir. */
const assertStatus = (request, allowedStatuses, message) => {
  if (!allowedStatuses.includes(request.status)) {
    const err = new Error(message);
    err.statusCode = 409;
    throw err;
  }
};

const requestLink = (requestId) => `/procurement/${requestId}`;

/**
 * Onay akışındaki kişilere portal bildirimi bırakır.
 * Bildirim yazılamazsa akış kesilmez; hata yalnızca loglanır.
 */
export const notifyUsers = async (users, message, link) => {
  const sink = mailSinkActive();
  const rows = (users || [])
    .filter((u) => u?.id && (!sink || isIsolatedMailbox(u.email)))
    .map((u) => ({ userId: u.id, message, link: link || null }));
  if (!rows.length) return;
  try {
    await prisma.notification.createMany({ data: rows });
  } catch (err) {
    console.error('❌ Onay akışı bildirimi oluşturulamadı:', err.message);
  }
};

export const sendWorkflowMail = async (payload) => {
  try {
    const { sendApprovalWorkflowEmail } = await import('../mail/mail.service.js');
    return await sendApprovalWorkflowEmail(payload);
  } catch (err) {
    console.error('❌ Onay akışı e-postası hazırlanamadı:', err.message);
    return false;
  }
};

/** Limit altı bilgilendirme: Mustafa’nın mailine CC. Ayrı hitap yok. */
const UNDER_LIMIT_NOTICE_CC = ['mcinar@ugurpromilling.com', 'gyanik@ugurpromilling.com'];
/** Üst yönetimden kim onaylarsa patron ve muhasebe aynı mailin kopyasını alır. */
const EXECUTIVE_APPROVAL_CC = ['mbarlik@ugurpromilling.com', 'gyanik@ugurpromilling.com'];

/** Limit altında yetkili onayı — üst yönetime (executiveEmail) özet bilgilendirme. */
const buildApprovedQuotesExtraHtml = (decision) => {
  const vendors = Array.isArray(decision?.vendors) ? decision.vendors : [];
  if (!vendors.length) return '';

  const rows = vendors
    .slice(0, 12)
    .map(
      (v, i) => `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'}">
        <td style="padding:9px 12px;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${escapeHtml(
          v.vendorName || 'Tedarikçi'
        )}</td>
        <td style="padding:9px 12px;font-size:13px;color:#1e293b;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;white-space:nowrap;">${escapeHtml(
          formatMoney(v.totalTRY)
        )}</td>
        <td style="padding:9px 12px;font-size:12px;color:#64748b;text-align:right;border-bottom:1px solid #e2e8f0;">${
          v.quotedItemCount != null ? `${Number(v.quotedItemCount)} kalem` : '—'
        }</td>
      </tr>`
    )
    .join('');

  return `<tr>
    <td style="padding:20px 28px;border-bottom:1px solid #f1f5f9;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Alınan teklifler</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#252b31;">
            <th style="padding:10px 12px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#D9B625;text-align:left;font-weight:800;">Tedarikçi</th>
            <th style="padding:10px 12px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#D9B625;text-align:right;font-weight:800;">Tutar (TL)</th>
            <th style="padding:10px 12px;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#D9B625;text-align:right;font-weight:800;">Kalem</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </td>
  </tr>`;
};

const sendUnderLimitExecutiveNotice = async ({
  request,
  decision,
  actor,
  managerNote,
  vendorLabel,
  totalText,
  limitText,
}) => {
  try {
    const limitCfg = await getApprovalLimit();
    const email = normalizeExecutiveEmail(limitCfg.executiveEmail);
    if (!email) {
      console.warn(
        `⚠️  ${request.id} limit altında onaylandı; executiveEmail tanımlı değil, üst yönetime bilgilendirme atlandı.`,
      );
      return false;
    }
    if (String(actor?.email || '').trim().toLowerCase() === email.toLowerCase()) {
      return false;
    }

    const source = request.sourceInternalRequest;
    const unitNoteRaw = (source?.description || request.description || '').trim();
    const unitNote = unitNoteRaw ? htmlToPlainText(unitNoteRaw) : null;
    const yetkiliNote = managerNote ? htmlToPlainText(managerNote) : null;
    const requesterUnit = source?.requesterUnit || null;

    return await sendWorkflowMail({
      to: email,
      subject: mailSubject('Limit altında onay', request.title),
      badge: 'Bilgilendirme',
      heading: 'Yetkili limit altında onay verdi',
      greetingStyle: 'bey',
      intro: `<p style="margin:0;">${mailStrong(actor.name)}, ${mailStrong(
        request.title
      )} talebini onay limitinin altında onayladı. Ek onayınız gerekmiyor; bu ileti yalnızca bilgilendirme içindir.</p>`,
      facts: [
        { label: 'Talep', value: request.title },
        { label: 'Onaylayan', value: actor.name },
        requesterUnit ? { label: 'Birim', value: requesterUnit } : null,
        vendorLabel ? { label: 'Seçilen cari', value: vendorLabel } : null,
        { label: 'Onaylanan tutar (TL)', value: totalText, strong: true },
        { label: 'Onay limiti', value: limitText },
      ].filter(Boolean),
      detailBlocks: [
        unitNote ? { title: 'Birim notu', body: unitNote } : null,
        yetkiliNote ? { title: 'Yetkili notu', body: yetkiliNote } : null,
      ].filter(Boolean),
      extraHtml: buildApprovedQuotesExtraHtml(decision),
      actionPath: requestLink(request.id),
      actionLabel: 'Talebi incele',
      tone: 'success',
      channel: MAIL_CHANNEL.OVER_LIMIT,
      teamCc: true,
      cc: UNDER_LIMIT_NOTICE_CC,
      note: 'Bu iletiye yanıt verirseniz Satın Alma Birimi Yetkilisine ulaşır.',
    });
  } catch (err) {
    console.error('❌ Limit altı üst yönetim bilgilendirmesi gönderilemedi:', err.message);
    return false;
  }
};

/** Satın alma birimi yetkilileri (müdür kadrosu). */
const findUnitManagers = (moduleId) =>
  prisma.user.findMany({
    where: {
      isActive: true,
      // Yedek parçada onay yetkilisi yok; birim kararları tüm ekibe düşer.
      ...(isYedekParcaModule(moduleId)
        ? { subRole: { in: ['MANAGER', 'STAFF'] } }
        : { subRole: 'MANAGER' }),
      role: { in: ['PURCHASING', 'ADMIN'] },
      moduleId: moduleId || 'SATIN_ALMA',
    },
    select: { id: true, name: true, email: true },
  });

/** Limit aşımında onay verecek üst yönetim / sistem yöneticisi kadrosu. */
const findExecutiveApprovers = () =>
  prisma.user.findMany({
    where: { isActive: true, role: 'ADMIN' },
    select: { id: true, name: true, email: true },
  });

/** Talebi onaya sunan personel; bulunamazsa atanan kişi, o da yoksa talebi oluşturan. */
const findSubmitter = async (request) => {
  const submitHistory = await prisma.procurementApprovalHistory.findFirst({
    where: { requestId: request.id, action: 'SUBMIT_TO_MANAGER' },
    orderBy: { createdAt: 'desc' },
    include: { actorUser: { select: { id: true, name: true, email: true } } },
  });
  return submitHistory?.actorUser || request.assignedTo || request.createdBy || null;
};

/* ─── Excel ile toplu kalem kartı (modül bazında aç/kapa) ─────────────── */

const EXCEL_IMPORT_MODULES = ['SATIN_ALMA', 'URETIM_PLANLAMA', 'YEDEK_PARCA'];

/** Kayıt yoksa açık sayılır; mevcut davranış korunur. */
export const getExcelImportSettings = async () => {
  const rows = await prisma.procurementExcelImportSetting.findMany({
    where: { id: { in: EXCEL_IMPORT_MODULES } },
  });
  const map = Object.fromEntries(EXCEL_IMPORT_MODULES.map((moduleId) => [moduleId, true]));
  for (const row of rows) map[row.id] = row.isEnabled;
  return map;
};

export const isExcelImportEnabled = async (moduleId) => {
  if (!EXCEL_IMPORT_MODULES.includes(moduleId)) return true;
  const row = await prisma.procurementExcelImportSetting.findUnique({ where: { id: moduleId } });
  return row ? row.isEnabled : true;
};

export const updateExcelImportSetting = async ({ moduleId, isEnabled }) => {
  if (!EXCEL_IMPORT_MODULES.includes(moduleId)) {
    const err = new Error('Geçersiz modül.');
    err.statusCode = 400;
    throw err;
  }
  const value = Boolean(isEnabled);
  await prisma.procurementExcelImportSetting.upsert({
    where: { id: moduleId },
    update: { isEnabled: value },
    create: { id: moduleId, isEnabled: value },
  });
  return getExcelImportSettings();
};

export const getApprovalLimit = async () => {
  const limit = await prisma.procurementApprovalLimit.findUnique({
    where: { id: 'singleton' },
  });
  return limit || { id: 'singleton', ...APPROVAL_LIMIT_DEFAULTS };
};

export const updateApprovalLimit = async ({ limitAmount, isActive, executiveEmail }) => {
  let parsedLimit;
  if (limitAmount !== undefined && limitAmount !== null) {
    parsedLimit = Number(limitAmount);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 0) {
      const err = new Error('Parasal onay limiti 0 veya daha büyük geçerli bir sayı olmalıdır.');
      err.statusCode = 400;
      throw err;
    }
  }

  let emailValue;
  if (executiveEmail !== undefined) {
    const raw = executiveEmail === null || executiveEmail === '' ? null : String(executiveEmail).trim();
    if (raw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      const err = new Error('Üst yönetim e-postası geçerli bir adres olmalıdır.');
      err.statusCode = 400;
      throw err;
    }
    emailValue = raw ? raw.toLowerCase() : null;
  }

  return prisma.procurementApprovalLimit.upsert({
    where: { id: 'singleton' },
    update: {
      limitAmount: parsedLimit,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      executiveEmail: emailValue,
    },
    create: {
      id: 'singleton',
      limitAmount: parsedLimit ?? APPROVAL_LIMIT_DEFAULTS.limitAmount,
      isActive: isActive !== undefined ? Boolean(isActive) : APPROVAL_LIMIT_DEFAULTS.isActive,
      moduleId: APPROVAL_LIMIT_DEFAULTS.moduleId,
      executiveEmail: emailValue ?? null,
    },
  });
};

const OVER_LIMIT_TOKEN_DAYS = 14;

const istanbulDayKey = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const normalizeExecutiveEmail = (email) => {
  const e = String(email || '')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
};

/** Bugünün (İstanbul) üst yönetim onay kutusu jetonunu getirir veya oluşturur. */
export const getOrCreateOverLimitTokenForToday = async (email) => {
  const normalized = normalizeExecutiveEmail(email);
  if (!normalized) {
    const err = new Error('Geçerli bir üst yönetim e-postası gerekli.');
    err.statusCode = 400;
    throw err;
  }
  const dayKey = istanbulDayKey();
  const existing = await prisma.overLimitApprovalToken.findUnique({
    where: { email_dayKey: { email: normalized, dayKey } },
  });
  const expiresAt = new Date(Date.now() + OVER_LIMIT_TOKEN_DAYS * 24 * 60 * 60 * 1000);
  if (existing) {
    if (existing.expiresAt > new Date()) return existing;
    return prisma.overLimitApprovalToken.update({
      where: { id: existing.id },
      data: { token: generateToken(), expiresAt },
    });
  }
  return prisma.overLimitApprovalToken.create({
    data: {
      token: generateToken(),
      email: normalized,
      dayKey,
      expiresAt,
    },
  });
};

const resolveOverLimitAccess = async (rawToken) => {
  const token = String(rawToken || '').trim();
  if (!token) {
    const err = new Error('Geçersiz onay bağlantısı.');
    err.statusCode = 404;
    throw err;
  }
  const row = await prisma.overLimitApprovalToken.findUnique({ where: { token } });
  if (!row) {
    const err = new Error('Geçersiz onay bağlantısı.');
    err.statusCode = 404;
    throw err;
  }
  if (row.expiresAt <= new Date()) {
    const err = new Error('Bu onay bağlantısının süresi dolmuş. Satın alma ekibinden yeni link isteyin.');
    err.statusCode = 410;
    throw err;
  }
  return row;
};

const commercialLabels = (assignment) => {
  const isVatIncluded = assignment?.isVatIncluded ?? true;
  const isShippingIncluded = assignment?.isShippingIncluded ?? true;
  const hasMaturity = assignment?.hasMaturity ?? false;
  const vatRate = assignment?.vatRate ?? null;
  const maturityDays = assignment?.maturityDays ?? null;
  return {
    vatLabel: isVatIncluded ? 'Dahil' : vatRate != null ? `Hariç (%${vatRate})` : 'Hariç',
    maturityLabel: hasMaturity ? (maturityDays != null ? `${maturityDays} gün` : 'Evet') : 'Hayır',
    shippingLabel: isShippingIncluded ? 'Dahil' : 'Hariç',
    overallDiscountRate: Number(assignment?.overallDiscountRate) || 0,
    usdRateFixed: Boolean(assignment?.usdRateFixed),
    usdRate: assignment?.usdRateFixed && Number(assignment?.usdRate) > 0 ? Number(assignment.usdRate) : null,
    eurRate: assignment?.usdRateFixed && Number(assignment?.eurRate) > 0 ? Number(assignment.eurRate) : null,
    chfRate: assignment?.usdRateFixed && Number(assignment?.chfRate) > 0 ? Number(assignment.chfRate) : null,
    quoteNote: assignment?.quoteNote ? String(assignment.quoteNote).trim() || null : null,
  };
};

/** Tek talep kartı: tutar, cariler, KDV/vade/nakliye, en uygun, kalem özeti. */
const extractManagerEscalationNote = (historyNote) => {
  if (!historyNote || typeof historyNote !== 'string') return null;
  const marker = '<<<YETKILI_NOT>>>';
  const markerIdx = historyNote.indexOf(marker);
  if (markerIdx !== -1) {
    const text = historyNote.slice(markerIdx + marker.length).trim();
    return text || null;
  }
  const legacy = historyNote.lastIndexOf(' Not: ');
  if (legacy !== -1) {
    const text = historyNote.slice(legacy + 6).trim();
    return text || null;
  }
  return null;
};

const currencySymbol = (code) =>
  code === 'USD' ? '$' : code === 'EUR' ? '€' : code === 'CHF' ? 'CHF' : '₺';

const formatQuotePriceLabel = (price, currency) => {
  const n = Number(price);
  if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currencySymbol(currency)}`;
};

const buildOverLimitInboxCard = async (request) => {
  const decision = await getApprovalDecision(request);
  const rates = decision.rates || { TRY: 1 };
  const assignmentByVendor = new Map((request.assignments || []).map((a) => [a.vendorId, a]));

  const vendors = (decision.vendors || []).map((v) => {
    const a = assignmentByVendor.get(v.vendorId);
    const c = commercialLabels(a);
    const ownCost = a?.shippingCostTRY != null ? Number(a.shippingCostTRY) : NaN;
    const legacyAvg =
      request.avgShippingCostTRY != null ? Number(request.avgShippingCostTRY) : NaN;
    const shippingCostTRY = Number.isFinite(ownCost)
      ? ownCost
      : a?.isShippingIncluded === false && Number.isFinite(legacyAvg)
        ? legacyAvg
        : null;
    const city = String(a?.vendor?.city || '').trim() || null;
    return {
      vendorId: v.vendorId,
      vendorName: v.vendorName,
      totalTRY: v.totalTRY,
      byCurrency: v.byCurrency,
      quotedItemCount: v.quotedItemCount,
      isBest: false,
      city,
      shippingCostTRY,
      ...c,
    };
  });

  for (const src of request.marketSources || []) {
    const vendorId = marketColumnId(src.id);
    let totalTRY = 0;
    let quotedItemCount = 0;
    const byCurrency = { TRY: 0, USD: 0, EUR: 0, CHF: 0 };
    for (const mq of src.quotes || []) {
      const item = (request.items || []).find((i) => i.id === mq.itemId);
      if (!item) continue;
      const net = lineNetTotal(
        item,
        { price: mq.price, currency: mq.currency, discountRate: 0, vatRate: null },
        null,
      );
      if (net == null) continue;
      const currency = mq.currency || 'TRY';
      byCurrency[currency] = (byCurrency[currency] || 0) + net;
      totalTRY += convertToTRY(net, currency, rates, null);
      quotedItemCount += 1;
    }
    vendors.push({
      vendorId,
      vendorName: marketColumnName(src),
      totalTRY,
      byCurrency,
      quotedItemCount,
      isBest: false,
      isMarket: true,
      marketChannel: src.channel,
      marketUrl: src.url,
      marketSellerName: src.sellerName,
      city: null,
      shippingCostTRY: null,
      vatLabel: '—',
      maturityLabel: '—',
      shippingLabel: '—',
      overallDiscountRate: 0,
    });
  }

  vendors.sort((a, b) =>
    String(a.vendorName || '').localeCompare(String(b.vendorName || ''), 'tr', {
      sensitivity: 'base',
      numeric: true,
    }),
  );

  let visualBestId = null;
  let visualBestTotal = Infinity;
  for (const v of vendors) {
    if (v.quotedItemCount > 0 && Number.isFinite(v.totalTRY) && v.totalTRY < visualBestTotal) {
      visualBestTotal = v.totalTRY;
      visualBestId = v.vendorId;
    }
  }
  for (const v of vendors) {
    v.isBest = Boolean(visualBestId) && v.vendorId === visualBestId;
  }

  const pickByItem = new Map((request.itemVendorPicks || []).map((p) => [p.itemId, p]));
  const soleVendorId =
    (request.assignments || []).length === 1 ? request.assignments[0].vendorId : null;

  let bestMixedTotalTRY = 0;
  let chosenOrBasisTotalTRY = 0;
  let itemsWithQuotes = 0;
  let itemsWhereChosenIsBest = 0;
  let itemsWhereChosenDiffers = 0;

  const displayItems = attachMarketQuotesForDisplay(request).items;
  const items = sortItemsInMemory(displayItems).map((item) => {
    const pick = pickByItem.get(item.id) || item.vendorPick;
    const chosenVendorId = presentChosenColumnId(pick) || soleVendorId || null;
    const quotes = (item.quotes || [])
      .filter((q) => q.price !== null && q.price !== undefined)
      .map((q) => {
        const a = assignmentByVendor.get(q.vendorId);
        const net = lineNetTotal(item, q, a);
        const currency = q.currency || 'TRY';
        const lineNetTRY =
          net != null && Number.isFinite(net)
            ? convertToTRY(net, currency, rates, assignmentFxOverride(a))
            : null;
        return {
          vendorId: q.vendorId,
          vendorName: q.isMarket ? q.vendor?.name || 'Online' : a?.vendor?.name || 'Tedarikçi',
          price: Number(q.price),
          currency,
          discountRate: Number(q.discountRate) || 0,
          lineNet: net,
          lineNetTRY,
          priceLabel: formatQuotePriceLabel(q.price, currency),
          lineNetLabel: net != null ? formatQuotePriceLabel(net, currency) : '—',
          isChosen: chosenVendorId ? q.vendorId === chosenVendorId : false,
          isBestVendor: q.vendorId === visualBestId,
          isBestForItem: false,
          isMarket: Boolean(q.isMarket),
          marketUrl: q.marketUrl || null,
        };
      });

    // Kalem bazında en uygun = en düşük satır tutarı (TL karşılığı)
    const priced = quotes.filter((q) => q.lineNetTRY != null && Number.isFinite(q.lineNetTRY));
    let bestForItemVendorId = null;
    let bestForItemLineNetTRY = null;
    if (priced.length) {
      priced.sort((a, b) => a.lineNetTRY - b.lineNetTRY);
      bestForItemVendorId = priced[0].vendorId;
      bestForItemLineNetTRY = priced[0].lineNetTRY;
      for (const q of quotes) {
        q.isBestForItem = q.vendorId === bestForItemVendorId;
      }
      // Gösterimde kalem en uygunu üstte
      quotes.sort((a, b) => {
        if (a.isBestForItem !== b.isBestForItem) return a.isBestForItem ? -1 : 1;
        if (a.isChosen !== b.isChosen) return a.isChosen ? -1 : 1;
        return (a.lineNetTRY ?? Infinity) - (b.lineNetTRY ?? Infinity);
      });
      itemsWithQuotes += 1;
      bestMixedTotalTRY += bestForItemLineNetTRY;
    }

    const chosenQuote = chosenVendorId
      ? quotes.find((q) => q.vendorId === chosenVendorId)
      : null;
    const chosenLineNetTRY = chosenQuote?.lineNetTRY ?? null;
    if (chosenLineNetTRY != null) {
      chosenOrBasisTotalTRY += chosenLineNetTRY;
      if (bestForItemVendorId && chosenVendorId === bestForItemVendorId) {
        itemsWhereChosenIsBest += 1;
      } else if (bestForItemVendorId && chosenVendorId !== bestForItemVendorId) {
        itemsWhereChosenDiffers += 1;
      }
    } else if (bestForItemLineNetTRY != null && !chosenVendorId) {
      // Seçim yoksa baz tutara en uygunu ekleme — onay tutarı decision.totalTRY
    }

    const bestForItemQuote = bestForItemVendorId
      ? quotes.find((q) => q.vendorId === bestForItemVendorId)
      : null;

    return {
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.unit || 'Adet',
      category: item.category || null,
      sortOrder: item.sortOrder ?? 0,
      chosenVendorId,
      bestForItemVendorId,
      bestForItemVendorName: bestForItemQuote?.vendorName || null,
      bestForItemLineNetTRY,
      bestForItemPriceLabel: bestForItemQuote?.priceLabel || null,
      chosenLineNetTRY,
      chosenDiffersFromBest:
        Boolean(chosenVendorId && bestForItemVendorId && chosenVendorId !== bestForItemVendorId),
      quotes,
    };
  });

  const escalationHistory =
    (request.approvalHistories || []).find((h) => h.action === 'MANAGER_APPROVE_ESCALATED') ||
    (await prisma.procurementApprovalHistory.findFirst({
      where: { requestId: request.id, action: 'MANAGER_APPROVE_ESCALATED' },
      orderBy: { createdAt: 'asc' },
      include: { actorUser: { select: { id: true, name: true } } },
    }));

  const managerNote = extractManagerEscalationNote(escalationHistory?.note);
  const escalatedByName = escalationHistory?.actorUser?.name || null;
  const escalatedAt = escalationHistory?.createdAt || null;
  const source = request.sourceInternalRequest || null;
  const requesterUnit = source?.requesterUnit || null;
  const unitNote = (source?.description || request.description || '').trim() || null;
  const createdByName = source?.createdBy?.name || request.createdBy?.name || null;

  const evaluationMode = (request.items || []).length > 1 ? 'PER_ITEM' : 'SINGLE';
  const attachments = await loadAttachmentsForApprovalCard(request.id);
  const unitAttachments = await loadUnitAttachmentsForApprovalCard(source?.id || null);

  return {
    id: request.id,
    title: request.title,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    itemCount: items.length,
    totalTRY: decision.totalTRY,
    limitAmount: decision.limitAmount,
    exceedsLimitBy: decision.exceedsLimitBy,
    basis: decision.basis,
    basisVendorName: decision.basisVendorName,
    vendors,
    bestVendorId: visualBestId,
    items,
    evaluationMode,
    itemEval: {
      bestMixedTotalTRY,
      itemsWithQuotes,
      itemsWhereChosenIsBest,
      itemsWhereChosenDiffers,
      potentialSavingTRY:
        decision.basis === 'ITEM_PICKS' && chosenOrBasisTotalTRY > 0
          ? Math.max(0, chosenOrBasisTotalTRY - bestMixedTotalTRY)
          : null,
    },
    requesterUnit,
    createdByName,
    unitNote,
    managerNote,
    neededBy: request.neededBy || source?.neededBy || null,
    escalatedByName,
    escalatedAt,
    attachments,
    unitAttachments,
    avgShippingCostTRY:
      request.avgShippingCostTRY != null && Number.isFinite(Number(request.avgShippingCostTRY))
        ? Number(request.avgShippingCostTRY)
        : null,
    shippingInputs: (request.assignments || [])
      .filter((a) => a.isShippingIncluded === false)
      .map((a) => ({
        vendorId: a.vendorId,
        vendorName: a.vendor?.name || 'Tedarikçi',
        city: String(a.vendor?.city || '').trim() || null,
        shippingCostTRY:
          a.shippingCostTRY != null && Number.isFinite(Number(a.shippingCostTRY))
            ? Number(a.shippingCostTRY)
            : null,
      })),
    kind:
      (request.moduleId || '') === 'SATIN_ALMA' ? 'OVER_LIMIT' : 'PRODUCTION_DECISION',
    moduleId: request.moduleId || 'URETIM_PLANLAMA',
  };
};

const executiveInboxWhere = () => {
  const now = new Date();
  return {
    OR: [
      { status: 'PENDING_ADMIN_APPROVAL', moduleId: 'SATIN_ALMA' },
      {
        moduleId: { in: [MODULE.URETIM, MODULE.YEDEK_PARCA] },
        decisionInvites: {
          some: {
            emailSentAt: { not: null },
            expiresAt: { gt: now },
            resolvedAt: null,
          },
        },
      },
    ],
  };
};

const countExecutiveInboxPending = () =>
  prisma.procurementRequest.count({ where: executiveInboxWhere() });

const MAX_EXECUTIVE_EXTRA_EMAILS = 15;

const parseRequestedEmails = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const e = normalizeExecutiveEmail(item);
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= MAX_EXECUTIVE_EXTRA_EMAILS) break;
  }
  return out;
};

const resolveExtraCcEmails = async (raw, canonicalEmail) => {
  const requested = parseRequestedEmails(raw);
  if (!requested.length) return [];
  const rows = await prisma.procurementNotificationCcContact.findMany({
    select: { email: true },
  });
  const allowed = new Set(
    rows.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean),
  );
  const canonical = normalizeExecutiveEmail(canonicalEmail);
  return requested.filter((e) => allowed.has(e) && e !== canonical);
};

const saveExecutiveInboxCopies = async (requestId, emails) => {
  if (!emails.length) return;
  await prisma.executiveInboxCopy.createMany({
    data: emails.map((email) => ({ requestId, email })),
    skipDuplicates: true,
  });
};

const canonicalExecutiveEmail = async () => {
  const cfg = await getApprovalLimit();
  return normalizeExecutiveEmail(cfg.executiveEmail);
};

const isPortalAdminEmail = async (email) => {
  const e = normalizeExecutiveEmail(email);
  if (!e) return false;
  const user = await prisma.user.findFirst({
    where: {
      role: 'ADMIN',
      isActive: true,
      email: { equals: e, mode: 'insensitive' },
    },
    select: { id: true },
  });
  return Boolean(user);
};

const executiveInboxWhereForAccess = async (access) => {
  const base = executiveInboxWhere();
  const canonical = await canonicalExecutiveEmail();
  const email = normalizeExecutiveEmail(access.email);
  if (!email) return { AND: [base, { id: { in: [] } }] };
  if (await isPortalAdminEmail(email)) return base;
  if (!canonical) return base;
  if (email === canonical) {
    return {
      AND: [
        base,
        {
          OR: [
            { executiveInboxCopies: { some: { email } } },
            { executiveInboxCopies: { none: {} } },
          ],
        },
      ],
    };
  }
  return {
    AND: [base, { executiveInboxCopies: { some: { email } } }],
  };
};

const assertTokenMayAccessRequest = async (access, request) => {
  const canonical = await canonicalExecutiveEmail();
  const email = normalizeExecutiveEmail(access.email);
  if (!email) {
    const err = new Error('Bu talep sizin onay kuyruğunuzda değil.');
    err.statusCode = 403;
    throw err;
  }
  if (await isPortalAdminEmail(email)) return;
  const copy = await prisma.executiveInboxCopy.findUnique({
    where: { requestId_email: { requestId: request.id, email } },
    select: { id: true },
  });
  if (copy) return;
  const copyCount = await prisma.executiveInboxCopy.count({ where: { requestId: request.id } });
  if (canonical && email === canonical && copyCount === 0) return;
  const err = new Error('Bu talep sizin onay kuyruğunuzda değil.');
  err.statusCode = 403;
  throw err;
};

const executiveInboxRequestInclude = () => ({
  ...APPROVAL_REQUEST_INCLUDE,
  approvalHistories: {
    where: { action: 'MANAGER_APPROVE_ESCALATED' },
    orderBy: { createdAt: 'asc' },
    take: 1,
    include: { actorUser: { select: { id: true, name: true } } },
  },
  decisionInvites: {
    where: { emailSentAt: { not: null }, resolvedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { emailSentAt: true },
  },
});

const requestIsSatinAlmaOverLimit = (request) =>
  (request.moduleId || '') === 'SATIN_ALMA' && request.status === 'PENDING_ADMIN_APPROVAL';

const requestHasActiveProductionInvite = async (requestId) => {
  const invite = await prisma.procurementDecisionInvite.findFirst({
    where: {
      requestId,
      emailSentAt: { not: null },
      expiresAt: { gt: new Date() },
      resolvedAt: null,
    },
    select: { id: true },
  });
  return Boolean(invite);
};

const assertInExecutiveInbox = async (request) => {
  if (requestIsSatinAlmaOverLimit(request)) return 'OVER_LIMIT';
  if (
    usesExecutiveDecisionInvite(request.moduleId) &&
    (await requestHasActiveProductionInvite(request.id))
  ) {
    return 'PRODUCTION_DECISION';
  }
  const err = new Error('Bu talep üst yönetim onay kuyruğunda değil.');
  err.statusCode = 409;
  throw err;
};

const findPickActingUserId = async () => {
  const actingUser =
    (await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'PURCHASING'] }, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })) ||
    (await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'PURCHASING'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    }));
  if (!actingUser) {
    const err = new Error('Seçimler kaydedilemedi (sistem kullanıcısı yok).');
    err.statusCode = 500;
    throw err;
  }
  return actingUser.id;
};

const applyInboxChoices = async (requestId, choices) => {
  if (!Array.isArray(choices) || choices.length === 0) {
    return loadRequestForApproval(requestId);
  }
  const actingUserId = await findPickActingUserId();
  await upsertItemVendorPicks(requestId, actingUserId, choices);
  return loadRequestForApproval(requestId);
};

const assertQuotedItemsHavePicks = (request) => {
  const itemsWithQuotes = (request.items || []).filter((item) => {
    const hasVendor = (item.quotes || []).some((q) => q.price !== null && q.price !== undefined);
    const hasMarket = (request.marketSources || []).some((s) =>
      (s.quotes || []).some((q) => q.itemId === item.id && q.price != null),
    );
    return hasVendor || hasMarket;
  });
  const pickByItem = new Map((request.itemVendorPicks || []).map((p) => [p.itemId, presentChosenColumnId(p)]));
  const missing = itemsWithQuotes.filter((item) => !pickByItem.has(item.id));
  if (missing.length) {
    const err = new Error(`Onay için her kalemde satıcı seçilmeli (${missing.length} kalem eksik).`);
    err.statusCode = 400;
    throw err;
  }
};

const resolveActiveDecisionInvites = async (requestId) => {
  await prisma.procurementDecisionInvite.updateMany({
    where: {
      requestId,
      resolvedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { resolvedAt: new Date() },
  });
};

/**
 * Limit aşımı e-postasındaki link: tüm bekleyen üst yönetim onaylarını listeler.
 */
export const getOverLimitInboxByToken = async (token) => {
  const access = await resolveOverLimitAccess(token);
  const rows = await prisma.procurementRequest.findMany({
    where: await executiveInboxWhereForAccess(access),
    include: executiveInboxRequestInclude(),
    orderBy: { updatedAt: 'asc' },
  });
  const pending = await Promise.all(
    rows.map(async (r) => {
      const card = await buildOverLimitInboxCard(r);
      if (card.kind === 'PRODUCTION_DECISION') {
        const queuedAt = r.decisionInvites?.[0]?.emailSentAt || r.updatedAt || r.createdAt;
        return { ...card, escalatedAt: queuedAt };
      }
      return card;
    }),
  );
  return {
    access: {
      email: access.email,
      dayKey: access.dayKey,
      expiresAt: access.expiresAt,
    },
    pendingCount: pending.length,
    pending,
  };
};

const assertStaffAdmin = (actor) => {
  if (actor?.role !== 'ADMIN') {
    const err = new Error('Bu işlem yalnızca sistem yöneticisine açıktır.');
    err.statusCode = 403;
    throw err;
  }
};

const collectInboxRecipients = (request, canonicalEmail) => {
  const seen = new Set();
  const recipients = [];
  const add = (raw, source) => {
    const email = normalizeExecutiveEmail(raw);
    if (!email || seen.has(email)) return;
    seen.add(email);
    recipients.push({
      email,
      source,
      isCanonical: Boolean(canonicalEmail && email === canonicalEmail),
    });
  };
  for (const row of request.executiveInboxCopies || []) add(row.email, 'copy');
  const invite = (request.decisionInvites || [])[0];
  if (invite) {
    add(invite.email, 'invite');
    for (const extra of invite.extraEmails || []) add(extra, 'invite');
  }
  return recipients;
};

/** Sistem yöneticisi: kopya filtresiz bekleyen üst yönetim kuyruğu. */
export const getStaffExecutiveInbox = async (actor) => {
  assertStaffAdmin(actor);
  const canonical = await canonicalExecutiveEmail();
  const rows = await prisma.procurementRequest.findMany({
    where: executiveInboxWhere(),
    select: {
      id: true,
      title: true,
      status: true,
      moduleId: true,
      updatedAt: true,
      createdAt: true,
      executiveInboxCopies: { select: { email: true, createdAt: true } },
      decisionInvites: {
        where: { resolvedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { email: true, extraEmails: true, emailSentAt: true, createdAt: true },
      },
      approvalHistories: {
        where: { action: 'MANAGER_APPROVE_ESCALATED' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: { updatedAt: 'asc' },
  });

  const pending = rows.map((r) => {
    const moduleId = r.moduleId || 'URETIM_PLANLAMA';
    const kind = moduleId === 'SATIN_ALMA' ? 'OVER_LIMIT' : 'PRODUCTION_DECISION';
    const invite = (r.decisionInvites || [])[0];
    const queuedAt =
      kind === 'PRODUCTION_DECISION'
        ? invite?.emailSentAt || invite?.createdAt || r.updatedAt || r.createdAt
        : r.approvalHistories?.[0]?.createdAt || r.updatedAt || r.createdAt;
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      moduleId,
      kind,
      queuedAt,
      mailPending: Boolean(invite && !invite.emailSentAt),
      recipients: collectInboxRecipients(r, canonical),
    };
  });

  return { pendingCount: pending.length, pending };
};

/** Sistem yöneticisi kendi e-postasıyla girişsiz karar ekranı linki (tam kuyruk). */
export const getStaffExecutivePreviewLink = async (actor) => {
  assertStaffAdmin(actor);
  const email = normalizeExecutiveEmail(actor.email);
  if (!email) {
    const err = new Error('Hesap e-postası geçersiz.');
    err.statusCode = 400;
    throw err;
  }
  const access = await getOrCreateOverLimitTokenForToday(email);
  return {
    url: `/executive-approval/${access.token}`,
    token: access.token,
    expiresAt: access.expiresAt,
    email: access.email,
  };
};

/** Sistem yöneticisi talebi üst yönetim kuyruğundan çeker (personel iadesi değil). */
export const recallFromExecutiveInbox = async (requestId, actor) => {
  assertStaffAdmin(actor);
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, title: true, status: true, moduleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const kind = await assertInExecutiveInbox(request);
  const actorName = actor.name || actor.email || 'Sistem yöneticisi';

  if (kind === 'PRODUCTION_DECISION') {
    await resolveActiveDecisionInvites(requestId);
    await prisma.executiveInboxCopy.deleteMany({ where: { requestId } });
    await prisma.procurementApprovalHistory.create({
      data: {
        requestId,
        actorUserId: actor.id,
        action: 'EXECUTIVE_INBOX_RECALL',
        note: `${actorName} ${
          isYedekParcaModule(request.moduleId) ? 'yedek parça' : 'üretim'
        } kararını üst yönetim kuyruğundan çekti. Teklif kilidi kalktı.`,
      },
    });
    return getStaffExecutiveInbox(actor);
  }

  assertStatus(
    request,
    ['PENDING_ADMIN_APPROVAL'],
    'Bu talep üst yönetim onay kuyruğunda değil.',
  );

  await prisma.procurementRequest.update({
    where: { id: requestId },
    data: { status: 'PENDING_MANAGER_APPROVAL' },
  });
  await prisma.executiveInboxCopy.deleteMany({ where: { requestId } });
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      action: 'EXECUTIVE_INBOX_RECALL',
      note: `${actorName} talebi üst yönetim kuyruğundan çekti. Kayıt yetkili onayına döndü.`,
    },
  });
  return getStaffExecutiveInbox(actor);
};

export const getOverLimitInboxItemByToken = async (token, requestId) => {
  const access = await resolveOverLimitAccess(token);
  const request = await loadRequestForApproval(requestId);
  await assertInExecutiveInbox(request);
  await assertTokenMayAccessRequest(access, request);
  return buildOverLimitInboxCard(request);
};

const notifyAfterExecutiveApprove = async (request, decision, actorName) => {
  const totalText = formatMoney(decision.totalTRY);
  const [managers, submitter] = await Promise.all([
    findUnitManagers(purchasingModuleOf(request)),
    findSubmitter(request),
  ]);
  const audience = [...managers, submitter].filter(Boolean);
  const uniqueAudience = [...new Map(audience.map((u) => [u.id, u])).values()];

  await notifyUsers(
    uniqueAudience,
    `"${request.title}" talebi üst yönetim tarafından onaylandı (${totalText}). Satın alma işlemlerine başlanabilir.`,
    requestLink(request.id),
  );
  await sendWorkflowMail({
    to: uniqueAudience.map((u) => u.email),
    subject: mailSubject('Üst yönetim onayı verildi', request.title),
    badge: 'Üst yönetim onayı',
    heading: 'Limit aşan teklif onaylandı',
    intro: `<p style="margin:0;">${mailStrong(actorName)}, ${mailStrong(
      request.title
    )} talebindeki limit aşan teklif toplamını onayladı. Kayıt satın alma birimine iade edilmiştir.</p>`,
    facts: [
      { label: 'Talep', value: request.title },
      { label: 'Onaylayan', value: actorName },
      { label: 'Onaylanan tutar (TL karşılığı)', value: totalText, strong: true },
    ],
    actionPath: requestLink(request.id),
    actionLabel: 'Talebi aç',
    tone: 'success',
    teamCc: usesSatinAlmaApprovalChain(request),
    cc: EXECUTIVE_APPROVAL_CC,
  });
};

const notifyAfterProductionDecision = async (request, actorName, { approved, note }) => {
  const submitter = await findSubmitter(request);
  const [managers] = await Promise.all([findUnitManagers(request.moduleId)]);
  const audience = approved
    ? [...managers, submitter].filter(Boolean)
    : [submitter].filter(Boolean);
  const uniqueAudience = [...new Map(audience.map((u) => [u.id, u])).values()];
  const sparePart = isYedekParcaModule(request.moduleId);
  const decisionWord = sparePart ? 'yedek parça kararı' : 'üretim kararı';
  const message = approved
    ? sparePart
      ? `"${request.title}" yedek parça talebi üst yönetim tarafından onaylandı. Satın alma tamamlanabilir.`
      : `"${request.title}" talebinde üst yönetim tedarikçi seçimini onayladı. Satın alma tamamlanabilir.`
    : `"${request.title}" talebindeki ${decisionWord} üst yönetim tarafından geri gönderildi. Teklifler yeniden güncellenebilir.`;
  await notifyUsers(uniqueAudience, message, requestLink(request.id));
  await sendWorkflowMail({
    to: uniqueAudience.map((u) => u.email),
    subject: mailSubject(
      approved
        ? sparePart
          ? 'Üst yönetim onayı verildi'
          : 'Teklif kararı kaydedildi'
        : 'Teklif kararı geri gönderildi',
      request.title,
    ),
    badge: approved ? 'Üst yönetim kararı' : 'Karar iade edildi',
    heading: approved
      ? sparePart
        ? 'Yedek parça teklifi onaylandı'
        : 'Tedarikçi seçimi kaydedildi'
      : sparePart
        ? 'Yedek parça kararı geri gönderildi'
        : 'Üretim kararı geri gönderildi',
    intro: approved
      ? sparePart
        ? `<p style="margin:0;">${mailStrong(actorName)}, ${mailStrong(
            request.title
          )} talebindeki tedarikçi seçimini onayladı. Yedek Parça satın almayı tamamlayabilir. Tedarikçi hazırlık bildirimi ayrıca durur.</p>`
        : `<p style="margin:0;">${mailStrong(actorName)}, ${mailStrong(
            request.title
          )} talebindeki tedarikçi seçimini onayladı. Talep satın alma tamamlamasına hazır.</p>`
      : `<p style="margin:0;">Üst Yönetim (${mailStrong(actorName)}), ${mailStrong(
          request.title
        )} talebindeki ${decisionWord}nı geri gönderdi. Teklif kilidi kalktı; kayıt yeniden değerlendirilebilir.</p>`,
    facts: [
      { label: 'Talep', value: request.title },
      { label: 'Karar veren', value: actorName },
      ...(note ? [{ label: 'Not', value: note }] : []),
    ],
    actionPath: requestLink(request.id),
    actionLabel: 'Talebi aç',
    tone: approved ? 'success' : 'danger',
    ...(approved ? { cc: EXECUTIVE_APPROVAL_CC } : {}),
  });
};

/** Limit aşımı reddi: personele değil Satın Alma yetkilisine (Çorlu) döner. Üretim yolu dokunulmaz. */
const returnOverLimitToSatinAlmaManager = async (request, { actorName, note, actorUserId = null }) => {
  const managers = await findUnitManagers('SATIN_ALMA');
  const primary = managers[0] || null;
  const updated = await prisma.procurementRequest.update({
    where: { id: request.id },
    data: {
      status: 'RETURNED_TO_MANAGER',
      assignedToId: primary?.id ?? request.assignedToId ?? null,
    },
  });
  const defaultRejectNote = `${actorName} teklif listesini onaylamadı; kayıt Satın Alma Birimi Yetkilisine iade edildi.`;
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId: request.id,
      actorUserId,
      targetUserId: primary?.id || null,
      action: 'ADMIN_REJECT',
      note: note?.trim() ? `${defaultRejectNote} Not: ${note.trim()}` : defaultRejectNote,
    },
  });
  await notifyUsers(
    managers,
    `"${request.title}" talebi üst yönetim tarafından onaylanmadı ve size iade edildi.`,
    requestLink(request.id),
  );
  {
    await sendWorkflowMail({
      to: managers.map((m) => m.email),
      teamCc: true,
      subject: mailSubject('Onaylanmadı — yetkiliye iade', request.title),
      badge: 'Yetkiliye iade',
      heading: 'Teklif listesi onaylanmadı',
      intro: `<p style="margin:0;">Üst Yönetim (${mailStrong(actorName)}), ${mailStrong(
        request.title
      )} talebindeki teklif listesini onaylamadı. Kayıt size iade edildi; notu görüp personele yönlendirebilirsiniz.</p>`,
      facts: [
        { label: 'Talep', value: request.title },
        { label: 'Karar veren', value: `${actorName} — Üst Yönetim` },
        ...(note ? [{ label: 'Gerekçe', value: note }] : []),
      ],
      actionPath: requestLink(request.id),
      actionLabel: 'Talebi aç',
      tone: 'danger',
    });
  }
  return updated;
};

/** Üye olmadan (e-posta linki) kutu talebini onayla. choices ile üst yönetici cari seçer. */
export const approveOverLimitByToken = async (token, requestId, note = null, choices = null) => {
  const access = await resolveOverLimitAccess(token);
  let request = await loadRequestForApproval(requestId);
  const kind = await assertInExecutiveInbox(request);
  await assertTokenMayAccessRequest(access, request);
  const actorName = `Üst yönetim (${access.email})`;

  request = await applyInboxChoices(requestId, choices);
  assertQuotedItemsHavePicks(request);

  if (kind === 'PRODUCTION_DECISION') {
    await resolveActiveDecisionInvites(requestId);
    const sparePart = isYedekParcaModule(request.moduleId);
    const ownDepartment = !isHandedToSatinAlma(request);
    if (ownDepartment && sparePart) {
      await prisma.procurementRequest.update({
        where: { id: requestId },
        data: { status: 'VENDOR_APPROVED' },
      });
      request = { ...request, status: 'VENDOR_APPROVED' };
    } else if (ownDepartment) {
      await prisma.procurementRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED_FOR_PURCHASE' },
      });
      request = { ...request, status: 'APPROVED_FOR_PURCHASE' };
    }
    const baseNote = sparePart
      ? `${actorName} yedek parça teklifini (kalem tedarikçi seçimiyle) onayladı. Satın alma tamamlanabilir; tedarikçi hazırlığı ayrıca sürer.`
      : `${actorName} üretim teklif kararını kaydetti. Talep satın alma tamamlamasına hazır.`;
    await prisma.procurementApprovalHistory.create({
      data: {
        requestId,
        actorUserId: null,
        action: sparePart ? 'ADMIN_APPROVE' : 'EXECUTIVE_VENDOR_PICK',
        note: appendDecisionBasis(
          note?.trim() ? `${baseNote} Not: ${note.trim()}` : baseNote,
          request,
        ),
      },
    });
    await notifyAfterProductionDecision(request, actorName, {
      approved: true,
      note: note?.trim() || null,
    });
    const inbox = await getOverLimitInboxByToken(token);
    return { request, inbox, kind };
  }

  assertStatus(
    request,
    ['PENDING_ADMIN_APPROVAL'],
    'Bu talep üst yönetim onayı aşamasında değil.',
  );

  const decision = await getApprovalDecision(request);
  const totalText = formatMoney(decision.totalTRY);
  const limitText = formatMoney(decision.limitAmount);

  const updated = await prisma.procurementRequest.update({
    where: { id: requestId },
    data: { status: 'APPROVED_FOR_PURCHASE' },
  });

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: null,
      action: 'ADMIN_APPROVE',
      note: appendDecisionBasis(
        note?.trim()
          ? `${actorName} parasal onay limitini (${limitText}) aşan ${totalText} tutarlı teklifi e-posta bağlantısı üzerinden (kalem bazlı cari seçimiyle) onayladı. Not: ${note.trim()}${rateNote(decision)}`
          : `${actorName} parasal onay limitini (${limitText}) aşan ${totalText} tutarlı teklifi e-posta bağlantısı üzerinden (kalem bazlı cari seçimiyle) onayladı. Sipariş satın alma birimine iletildi.${rateNote(decision)}`,
        request,
      ),
    },
  });

  await notifyAfterExecutiveApprove(request, decision, actorName);
  const inbox = await getOverLimitInboxByToken(token);
  return { request: updated, decision, inbox, kind };
};

/** Üye olmadan (e-posta linki) kutu talebini reddet / personele iade. */
export const rejectOverLimitByToken = async (token, requestId, note = null) => {
  const access = await resolveOverLimitAccess(token);
  const request = await loadRequestForApproval(requestId);
  const kind = await assertInExecutiveInbox(request);
  await assertTokenMayAccessRequest(access, request);
  const actorName = `Üst yönetim (${access.email})`;

  if (kind === 'PRODUCTION_DECISION') {
    await resolveActiveDecisionInvites(requestId);
    await prisma.procurementApprovalHistory.create({
      data: {
        requestId,
        actorUserId: null,
        action: 'EXECUTIVE_VENDOR_PICK_REJECT',
        note: (() => {
          const what = isYedekParcaModule(request.moduleId) ? 'yedek parça' : 'üretim';
          const base = `${actorName} ${what} kararını geri gönderdi; teklif kilidi kalktı. Talep durumu değişmedi.`;
          return note?.trim() ? `${base} Not: ${note.trim()}` : base;
        })(),
      },
    });
    await notifyAfterProductionDecision(request, actorName, {
      approved: false,
      note: note?.trim() || null,
    });
    const inbox = await getOverLimitInboxByToken(token);
    return { request, inbox, kind };
  }

  assertStatus(
    request,
    ['PENDING_ADMIN_APPROVAL'],
    'Bu talep üst yönetim onayı aşamasında değil.',
  );

  const updated = await returnOverLimitToSatinAlmaManager(request, {
    actorName,
    note,
    actorUserId: null,
  });
  const inbox = await getOverLimitInboxByToken(token);
  return { request: updated, inbox, kind };
};

/** Limit aşımında günlük onay kutusu e-postasını gönderir. */
export const sendOverLimitInboxMailForRequest = async ({
  request,
  decision,
  escalatedByName,
  kind,
  extraEmails = [],
  includeCanonical = true,
}) => {
  const limitCfg = await getApprovalLimit();
  const canonical = normalizeExecutiveEmail(limitCfg.executiveEmail);
  const extras = await resolveExtraCcEmails(extraEmails, canonical);
  const sendCanonical = includeCanonical !== false && Boolean(canonical);
  const recipients = [...(sendCanonical ? [canonical] : []), ...extras];
  if (!recipients.length) {
    if (includeCanonical !== false && !canonical) {
      console.warn(
        `⚠️  ${request.id} üst yönetime yükseldi fakat onay limiti ayarında executiveEmail yok.`,
      );
      return { sent: false, reason: 'missing_email' };
    }
    return { sent: false, reason: 'no_recipients' };
  }

  await saveExecutiveInboxCopies(
    request.id,
    mailSinkActive() ? recipients.filter((to) => isIsolatedMailbox(to)) : recipients,
  );

  const totalText = formatMoney(decision.totalTRY);
  const limitText = formatMoney(decision.limitAmount);
  const mailKind =
    kind ||
    ((request.moduleId || '') === 'SATIN_ALMA' ? 'OVER_LIMIT' : 'PRODUCTION_DECISION');

  const { sendOverLimitInboxEmail } = await import('../mail/mail.service.js');

  const sendOne = async (to, viewerEmail) => {
    if (mailSinkActive()) {
      return sendOverLimitInboxEmail({
        to,
        requestTitle: request.title,
        escalatedByName,
        totalText,
        limitText,
        exceedsText: formatMoney(decision.exceedsLimitBy),
        pendingCount: 0,
        inboxPath: '/executive-approval/mail-sink',
        kind: mailKind,
        unitLabel: moduleLabel(request.moduleId),
        replyToUser: sparePartReplyTo,
      });
    }
    const access = await getOrCreateOverLimitTokenForToday(to);
    const inboxPath = `/executive-approval/${access.token}`;
    const where = await executiveInboxWhereForAccess({ email: viewerEmail });
    const pendingCountRaw = await prisma.procurementRequest.count({ where });
    const alreadyQueued = await prisma.procurementRequest.count({
      where: { AND: [where, { id: request.id }] },
    });
    const pendingCount = pendingCountRaw + (alreadyQueued ? 0 : 1);
    return sendOverLimitInboxEmail({
      to,
      requestTitle: request.title,
      escalatedByName,
      totalText,
      limitText,
      exceedsText: formatMoney(decision.exceedsLimitBy),
      pendingCount,
      inboxPath,
      kind: mailKind,
      unitLabel: moduleLabel(request.moduleId),
      replyToUser: sparePartReplyTo,
    });
  };
  const sparePartReplyTo = isYedekParcaModule(request.moduleId)
    ? await prisma.user.findFirst({
        where: { id: { in: [request.assignedToId, request.createdById].filter(Boolean) } },
        select: { name: true, email: true },
      })
    : null;

  let sentCount = 0;
  for (const to of recipients) {
    const ok = await sendOne(to, to);
    if (ok) sentCount += 1;
  }

  return {
    sent: sentCount > 0,
    email: sendCanonical ? canonical : null,
    extraEmails: extras,
    includeCanonical: sendCanonical,
    pendingCount: await countExecutiveInboxPending(),
  };
};

/**
 * Bir kalemin net tutarı (onay / limit): birim fiyat × miktar → kalem iskontosu → cari geneli iskonto.
 * KDV dahil edilmez; Mahmut’un 10k limiti KDV hariç bakılır. Fiyat yoksa null.
 */
const lineNetTotal = (item, quote, assignment) => {
  const price = Number(quote?.price);
  if (!Number.isFinite(price)) return null;
  const quantity = Number(item?.quantity);
  if (!Number.isFinite(quantity)) return null;
  const itemDiscount = Number(quote?.discountRate) || 0;
  const overallDiscount = Number(assignment?.overallDiscountRate) || 0;
  return price * quantity * (1 - itemDiscount / 100) * (1 - overallDiscount / 100);
};

const emptyCurrencyBag = () => ({ TRY: 0, USD: 0, EUR: 0, CHF: 0 });

/**
 * Talebin onay tutarını çıkarır.
 *
 * Teklifler TRY/USD/EUR/CHF karışık girilebildiği için limit karşılaştırması
 * TCMB kuruyla TL'ye çevrilmiş toplam üzerinden yapılır.
 *
 * Esas alınan tutar:
 *  - Kalem bazında cari seçimi yapılmışsa (RequestItemVendorPick) seçilen tekliflerin toplamı,
 *  - Seçim yapılmamışsa en yüksek cari toplamı (limit kontrolü güvenli tarafta kalsın diye).
 */
/** Kalem başına en düşük satır tutarı (TL) ve sütunu; cari + online piyasa birlikte. */
const bestColumnByItem = (request, rates) => {
  const assignmentByVendor = new Map((request.assignments || []).map((a) => [a.vendorId, a]));
  const out = new Map();
  for (const item of attachMarketQuotesForDisplay(request).items || []) {
    let best = null;
    for (const q of item.quotes || []) {
      if (q.price === null || q.price === undefined) continue;
      const a = isMarketColumnId(q.vendorId) ? null : assignmentByVendor.get(q.vendorId);
      const net = lineNetTotal(item, q, a);
      if (net === null) continue;
      const lineTRY = convertToTRY(net, q.currency || 'TRY', rates, assignmentFxOverride(a));
      if (!Number.isFinite(lineTRY)) continue;
      if (!best || lineTRY < best.lineTRY) best = { columnId: q.vendorId, lineTRY };
    }
    if (best) out.set(item.id, best);
  }
  return out;
};

export const buildApprovalSummary = (request, rates) => {
  const assignmentByVendor = new Map((request.assignments || []).map((a) => [a.vendorId, a]));
  const pickByItem = new Map((request.itemVendorPicks || []).map((p) => [p.itemId, p]));
  const bestByItem = bestColumnByItem(request, rates);
  const quotedItemsByVendor = new Map();
  const isSatinAlma = (request.moduleId || '') === 'SATIN_ALMA';

  const vendorTotals = new Map();
  const pickedByCurrency = emptyCurrencyBag();
  let pickedTotalTRY = 0;
  let pickedItemCount = 0;
  let pickedItemsWithoutPrice = 0;

  for (const item of request.items || []) {
    for (const quote of item.quotes || []) {
      if (isMarketQuoteLike(quote)) continue;
      const assignment = assignmentByVendor.get(quote.vendorId);
      const net = lineNetTotal(item, quote, assignment);
      if (net === null) continue;
      const currency = quote.currency || 'TRY';

      const entry = vendorTotals.get(quote.vendorId) || {
        vendorId: quote.vendorId,
        vendorName: assignment?.vendor?.name || 'Bilinmeyen tedarikçi',
        byCurrency: emptyCurrencyBag(),
        totalTRY: 0,
        quotedItemCount: 0,
        overallDiscountRate: Number(assignment?.overallDiscountRate) || 0,
        usdRateFixed: Boolean(assignment?.usdRateFixed),
        usdRate: assignment?.usdRateFixed && Number(assignment?.usdRate) > 0 ? Number(assignment.usdRate) : null,
        eurRate: assignment?.usdRateFixed && Number(assignment?.eurRate) > 0 ? Number(assignment.eurRate) : null,
        chfRate: assignment?.usdRateFixed && Number(assignment?.chfRate) > 0 ? Number(assignment.chfRate) : null,
        quoteNote: assignment?.quoteNote ? String(assignment.quoteNote).trim() || null : null,
      };
      entry.byCurrency[currency] = (entry.byCurrency[currency] || 0) + net;
      entry.totalTRY += convertToTRY(net, currency, rates, assignmentFxOverride(assignment));
      entry.quotedItemCount += 1;
      vendorTotals.set(quote.vendorId, entry);
      const quoted = quotedItemsByVendor.get(quote.vendorId) || new Set();
      quoted.add(item.id);
      quotedItemsByVendor.set(quote.vendorId, quoted);
    }
  }

  // Eksik teklifli cari, fiyat vermediği kalemler en uygun fiyatla tamamlanmış haliyle değerlendirilir.
  for (const entry of vendorTotals.values()) {
    const quoted = quotedItemsByVendor.get(entry.vendorId) || new Set();
    let fill = 0;
    let missing = 0;
    for (const [itemId, best] of bestByItem) {
      if (quoted.has(itemId)) continue;
      fill += best.lineTRY;
      missing += 1;
    }
    entry.missingItemCount = missing;
    entry.completedTotalTRY = entry.totalTRY + fill;
  }

  let unpickedFillTRY = 0;
  let unpickedFilledCount = 0;
  const displayed = attachMarketQuotesForDisplay(request);
  for (const item of displayed.items || []) {
    const pick = pickByItem.get(item.id) || item.vendorPick;
    const chosenVendorId = presentChosenColumnId(pick);
    if (!pick && bestByItem.has(item.id)) {
      unpickedFillTRY += bestByItem.get(item.id).lineTRY;
      unpickedFilledCount += 1;
    }
    if (!chosenVendorId) continue;

    const quote = (item.quotes || []).find((q) => q.vendorId === chosenVendorId);
    const assignment = isMarketColumnId(chosenVendorId)
      ? null
      : assignmentByVendor.get(chosenVendorId);
    const net = lineNetTotal(item, quote, assignment);
    if (net === null) {
      pickedItemsWithoutPrice += 1;
      continue;
    }
    const currency = quote.currency || 'TRY';
    pickedByCurrency[currency] = (pickedByCurrency[currency] || 0) + net;
    pickedTotalTRY += convertToTRY(net, currency, rates, assignmentFxOverride(assignment));
    pickedItemCount += 1;
  }

  const vendors = [...vendorTotals.values()].sort((a, b) => b.totalTRY - a.totalTRY);
  const highestVendor = vendors[0] || null;
  const hasPicks = pickedItemCount > 0;

  let basis = 'NO_QUOTES';
  if (hasPicks) basis = 'ITEM_PICKS';
  else if (highestVendor) basis = 'HIGHEST_VENDOR_TOTAL';

  return {
    basis,
    // Seçim yapılmamış (satırı hiç olmayan) teklifli kalemler limit hesabında en uygun fiyatla sayılır.
    totalTRY: hasPicks
      ? pickedTotalTRY + (isSatinAlma ? unpickedFillTRY : 0)
      : highestVendor?.totalTRY || 0,
    unpickedFilledCount: hasPicks && isSatinAlma ? unpickedFilledCount : 0,
    byCurrency: hasPicks ? pickedByCurrency : highestVendor?.byCurrency || emptyCurrencyBag(),
    pickedItemCount,
    pickedItemsWithoutPrice,
    totalItemCount: (request.items || []).length,
    basisVendorName: hasPicks ? null : highestVendor?.vendorName || null,
    vendors,
  };
};

/**
 * Onay kararına esas tutar + geçerli limit + limitin aşılıp aşılmadığı.
 * Hem onay uçlarında hem de ekranda "ne kadar / limit ne" göstermek için kullanılır.
 */
export const getApprovalDecision = async (requestIdOrRequest) => {
  const request =
    typeof requestIdOrRequest === 'string'
      ? await loadRequestForApproval(requestIdOrRequest)
      : requestIdOrRequest;

  const [rateInfo, limitConfig] = await Promise.all([
    resolveRatesForRequest(request),
    getApprovalLimit(),
  ]);
  const summary = buildApprovalSummary(request, rateInfo.rates);

  const limitAmount = Number(limitConfig.limitAmount) || 0;
  const limitIsActive = Boolean(limitConfig.isActive);
  const moduleIsSatinAlma = usesSatinAlmaApprovalChain(request);
  const totalCents = moneyCents(summary.totalTRY);
  const limitCents = moneyCents(limitAmount);
  const requiresExecutiveApproval =
    moduleIsSatinAlma && limitIsActive && totalCents > limitCents;

  const vendors = (summary.vendors || []).map((v) => ({
    ...v,
    exceedsLimit:
      moduleIsSatinAlma && limitIsActive && moneyCents(v.completedTotalTRY ?? v.totalTRY) > limitCents,
  }));

  return {
    ...summary,
    vendors,
    requestId: request.id,
    requestTitle: request.title,
    status: request.status,
    totalTRY: centsToTry(totalCents),
    limitAmount,
    limitIsActive: moduleIsSatinAlma && limitIsActive,
    requiresExecutiveApproval,
    exceedsLimitBy: requiresExecutiveApproval ? centsToTry(totalCents - limitCents) : 0,
    rates: rateInfo.rates,
    rateSource: rateInfo.source,
    rateFetchedAt: rateInfo.fetchedAt,
    rateFrozenAt: rateInfo.frozenAt || null,
    ratesFrozen: Boolean(rateInfo.isFrozen),
    ratesLegacyUnlocked: Boolean(rateInfo.legacyUnlocked),
    moduleScopedOut: !moduleIsSatinAlma,
  };
};

const ORDER_DOSSIER_ACTIONS = {
  MANAGER_APPROVE: 'Satın Alma Yetkilisi onayladı',
  MANAGER_APPROVE_ESCALATED: 'Satın Alma Yetkilisi üst yönetime iletti',
  ADMIN_APPROVE: 'Üst yönetim onayladı',
  ROUTE_TO_STAFF: 'Personele yönlendirildi',
};

const actorNameFromHistory = (row) => {
  if (row?.actorUser?.name) return row.actorUser.name;
  const note = String(row?.note || '');
  const exec = note.match(/Üst yönetim \(([^)]+)\)/i);
  if (exec?.[1]) return exec[1].trim();
  const yetkili = note.match(/Satın Alma Birimi Yetkilisi (.+?) teklif/i);
  if (yetkili?.[1]) return yetkili[1].trim();
  return null;
};

/** Sipariş / onay dosyası: executive tablosu + kim ne zaman onayladı (yazdırma). */
export const getOrderDossier = async (requestId, viewer = null) => {
  const request = await loadRequestForApproval(requestId);
  assertProcurementReadable(viewer, request);

  const card = await buildOverLimitInboxCard(request);
  const histories = await prisma.procurementApprovalHistory.findMany({
    where: { requestId },
    orderBy: { createdAt: 'asc' },
    include: { actorUser: { select: { id: true, name: true, email: true } } },
  });

  const approvalTrail = histories
    .filter((h) => ORDER_DOSSIER_ACTIONS[h.action])
    .map((h) => ({
      action: h.action,
      label: ORDER_DOSSIER_ACTIONS[h.action],
      name: actorNameFromHistory(h),
      at: h.createdAt,
      note: extractManagerEscalationNote(h.note),
    }));

  const pickByItem = new Map((request.itemVendorPicks || []).map((p) => [p.itemId, p]));
  const orderByVendor = new Map();
  for (const item of card.items || []) {
    const vid = item.chosenVendorId;
    if (!vid) continue;
    const vendor = (card.vendors || []).find((v) => v.vendorId === vid);
    const name = vendor?.vendorName || item.quotes?.find((q) => q.vendorId === vid)?.vendorName || 'Tedarikçi';
    const entry = orderByVendor.get(vid) || {
      vendorId: vid,
      vendorName: name,
      itemCount: 0,
      totalTRY: 0,
      selectedAt: null,
    };
    entry.itemCount += 1;
    if (item.chosenLineNetTRY != null && Number.isFinite(item.chosenLineNetTRY)) {
      entry.totalTRY += item.chosenLineNetTRY;
    }
    const pickedAt = pickByItem.get(item.id)?.updatedAt || pickByItem.get(item.id)?.createdAt || null;
    if (pickedAt) {
      const t = new Date(pickedAt).getTime();
      const prev = entry.selectedAt ? new Date(entry.selectedAt).getTime() : 0;
      if (Number.isFinite(t) && t >= prev) {
        entry.selectedAt = pickedAt instanceof Date ? pickedAt.toISOString() : pickedAt;
      }
    }
    orderByVendor.set(vid, entry);
  }

  return {
    ...card,
    unitNote: card.unitNote ? htmlToPlainText(card.unitNote) : null,
    managerNote: card.managerNote ? htmlToPlainText(card.managerNote) : null,
    approvalTrail,
    orderVendors: [...orderByVendor.values()],
    printedAt: new Date().toISOString(),
  };
};

/** Ekran için özet: talebe erişim kontrolü getById ile aynı kurala tabidir. */
export const getApprovalSummary = async (requestId, viewer = null) => {
  const request = await loadRequestForApproval(requestId);
  assertProcurementReadable(viewer, request);
  return getApprovalDecision(request);
};

/** Kur kaynağı projeksiyona düştüyse onay notuna şerh düşülür. */
const rateNote = (decision) => {
  const fxUsed = ['USD', 'EUR', 'CHF'].filter((c) => (decision.byCurrency?.[c] || 0) > 0);
  if (!fxUsed.length) return '';
  const rateText = fxUsed.map((c) => `1 ${c} = ${formatMoney(decision.rates?.[c])}`).join(', ');
  const sourceText =
    decision.rateSource === 'TCMB_LIVE' ? 'TCMB güncel kuru' : `kur kaynağı: ${decision.rateSource}`;
  return ` (Döviz kalemleri ${sourceText} ile TL'ye çevrildi — ${rateText}.)`;
};

const assertSatinAlmaApprovalActor = (request, actor) => {
  if (!usesSatinAlmaApprovalChain(request)) {
    throw forbid('Parasal onay zinciri yalnızca satın alma sorumluluğundaki talepler içindir.', 403);
  }
  if (actor?.role === 'ADMIN') return;
  if (actor?.role === 'PURCHASING' && actor?.moduleId === 'SATIN_ALMA') return;
  throw forbid('Bu onay işlemi için satın alma birimi yetkisi gerekir.', 403);
};

const collectExcludedShippingUpdates = (request, vendorShippingCosts) => {
  const excluded = (request.assignments || []).filter((a) => a.isShippingIncluded === false);
  if (!excluded.length) return [];
  const costByVendor = new Map(
    (Array.isArray(vendorShippingCosts) ? vendorShippingCosts : [])
      .filter((x) => x && x.vendorId)
      .map((x) => [String(x.vendorId), Number(x.costTRY)]),
  );
  const shippingUpdates = [];
  const missing = [];
  for (const a of excluded) {
    const n = costByVendor.get(a.vendorId);
    if (!Number.isFinite(n) || n < 0) {
      missing.push(a.vendor?.name || a.vendorId);
    } else {
      shippingUpdates.push({ id: a.id, costTRY: n });
    }
  }
  if (missing.length) {
    const err = new Error(
      `Nakliye hariç teklif var. Her cari için ayrı nakliye bedeli (TRY) girin: ${missing.join(', ')}.`,
    );
    err.statusCode = 400;
    throw err;
  }
  return shippingUpdates;
};

const persistShippingUpdates = async (tx, requestId, shippingUpdates) => {
  await tx.requestVendorAssignment.updateMany({
    where: { requestId },
    data: { shippingCostTRY: null },
  });
  for (const u of shippingUpdates) {
    await tx.requestVendorAssignment.update({
      where: { id: u.id },
      data: { shippingCostTRY: u.costTRY },
    });
  }
};

/**
 * Satın alma tamamlanınca seçilen carilere mail + SMS.
 * Onay anında gitmez; personel "Satın almayı tamamla" deyince gider.
 * Her cari aynı talep için bir kez bilgilendirilir; şirket içi kişiyle çakışan cariye gönderilmez.
 * Hata akışı kesmez.
 */
const notifyApprovedVendors = async (requestId, actor = null) => {
  try {
    const request = await prisma.procurementRequest.findUnique({
      where: { id: requestId },
      include: {
        items: { orderBy: { sortOrder: 'asc' }, include: { quotes: true } },
        assignments: { include: { vendor: { include: { contacts: true } } } },
        itemVendorPicks: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!request || !usesSatinAlmaApprovalChain(request) || request.status !== 'COMPLETED') return;

    const pickByItem = new Map(
      (request.itemVendorPicks || []).filter((p) => p.chosenVendorId).map((p) => [p.itemId, p.chosenVendorId]),
    );
    if (!pickByItem.size) {
      console.warn(`⚠️  ${requestId} onaylandı fakat kalem bazlı cari seçimi yok; tedarikçiye onay bildirimi gönderilmedi.`);
      return;
    }

    const assignmentByVendor = new Map((request.assignments || []).map((a) => [a.vendorId, a]));
    const byVendor = new Map();
    for (const item of request.items || []) {
      const vendorId = pickByItem.get(item.id);
      if (!vendorId) continue;
      const assignment = assignmentByVendor.get(vendorId);
      const quote = (item.quotes || []).find((q) => q.vendorId === vendorId);
      const list = byVendor.get(vendorId) || [];
      list.push({
        productName: item.productName,
        quantity: item.quantity,
        unit: item.unit,
        price: quote?.price ?? null,
        currency: quote?.currency || 'TRY',
        discountRate: quote?.discountRate || 0,
        lineTotal: lineNetTotal(item, quote, assignment),
      });
      byVendor.set(vendorId, list);
    }

    const already = await prisma.auditEvent.findMany({
      where: { requestId, action: 'VENDOR_APPROVAL_NOTIFIED' },
      select: { vendorId: true },
    });
    const done = new Set(already.map((a) => a.vendorId));
    const internalUsers = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['ADMIN', 'PURCHASING'] } },
      select: { id: true, email: true, phone: true, name: true },
    });
    const { findVendorActorOverlap } = await import('../../lib/identityMatch.js');
    const { sendVendorApprovedEmail } = await import('../mail/mail.service.js');
    const { sendVendorApprovedSms } = await import('../sms/sms.service.js');

    const notified = [];
    for (const [vendorId, items] of byVendor) {
      if (done.has(vendorId)) continue;
      const vendor = assignmentByVendor.get(vendorId)?.vendor;
      if (!vendor) continue;
      if (findVendorActorOverlap(vendor, null, internalUsers).length) {
        console.warn(`⚠️  ${vendor.name} iletişim bilgisi şirket içi kullanıcıyla çakışıyor; onay bildirimi atlandı.`);
        continue;
      }
      const email = await sendVendorApprovedEmail({
        vendor,
        request,
        items,
        approvedAt: new Date(),
        actor: request.assignedTo || request.createdBy || actor,
        approverName: actor?.name || request.assignedTo?.name || request.createdBy?.name,
      });
      const sms = await sendVendorApprovedSms({ vendor, request, itemCount: items.length });
      await recordAudit({
        actorUserId: actor?.id || null,
        action: 'VENDOR_APPROVAL_NOTIFIED',
        severity: 'INFO',
        vendorId,
        requestId,
        payload: { vendorName: vendor.name, email, sms: Boolean(sms?.ok), itemCount: items.length },
      });
      notified.push(`${vendor.name} (${[email ? 'mail' : null, sms?.ok ? 'SMS' : null].filter(Boolean).join(' + ') || 'gönderilemedi'})`);
    }

    if (notified.length) {
      await prisma.procurementApprovalHistory.create({
        data: {
          requestId,
          actorUserId: actor?.id || null,
          action: 'VENDOR_APPROVAL_NOTIFIED',
          note: `Teklif onayı tedarikçilere bildirildi: ${notified.join(', ')}.`,
        },
      });
    }
  } catch (err) {
    console.error('❌ Tedarikçi onay bildirimi gönderilemedi:', err.message);
  }
};

/** Onaya sunma maili: tek “teklif toplamı” yok. Her cari kendi tutarını yazar. */
const quotedVendorRows = (decision) =>
  (decision?.vendors || []).filter((v) => Number(v.quotedItemCount) > 0);

const quotedVendorBrief = (decision) =>
  quotedVendorRows(decision)
    .map((v) => `${v.vendorName || 'Tedarikçi'} ${formatMoney(v.totalTRY)}`)
    .join(', ');

const quotedVendorFacts = (decision) =>
  quotedVendorRows(decision).map((v) => ({
    label: v.vendorName || 'Tedarikçi',
    value:
      Number(v.missingItemCount) > 0
        ? `${formatMoney(v.totalTRY)} · ${v.quotedItemCount} kalem`
        : formatMoney(v.totalTRY),
    strong: true,
  }));

export const submitForApproval = async (requestId, actor, note = null, vendorShippingCosts = []) => {
  const request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  const submitStatuses = ['VENDOR_QUOTED', 'SENT_TO_VENDOR'];
  if (isHandedToSatinAlma(request)) submitStatuses.push('VENDOR_APPROVED', 'IN_PRODUCTION');
  assertStatus(
    request,
    submitStatuses,
    'Bu talep onaya sunulabilecek durumda değil. Yalnızca tedarikçi fiyatları alınmış talepler yetkili onayına gönderilebilir.'
  );

  const hasAnyQuote = (request.items || []).some((item) => (item.quotes || []).length > 0);
  if (!hasAnyQuote) {
    const err = new Error('Tedarikçilerden henüz fiyat gelmedi; talep yetkili onayına gönderilemez.');
    err.statusCode = 409;
    throw err;
  }

  const shippingUpdates = collectExcludedShippingUpdates(request, vendorShippingCosts);

  const decision = await getApprovalDecision(request);

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.procurementRequest.update({
    where: { id: requestId },
      data: {
        status: 'PENDING_MANAGER_APPROVAL',
        avgShippingCostTRY: null,
      },
    });
    await persistShippingUpdates(tx, requestId, shippingUpdates);
    await tx.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      action: 'SUBMIT_TO_MANAGER',
      note:
        note ||
        `${actor.name} teklifleri değerlendirdi (${quotedVendorBrief(decision) || formatMoney(decision.totalTRY)}) ve onay için Satın Alma Birimi Yetkilisine iletti.`,
    },
    });
    return row;
  });

  const managers = await findUnitManagers(purchasingModuleOf(request));
  await notifyUsers(
    managers,
    `"${request.title}" talebi ${actor.name} tarafından onayınıza sunuldu${
      quotedVendorBrief(decision) ? ` (${quotedVendorBrief(decision)})` : ''
    }.`,
    requestLink(requestId)
  );
  await sendWorkflowMail({
    to: managers.map((m) => m.email),
    subject: mailSubject('Onayınız bekleniyor', request.title),
    badge: 'Yetkili onayı bekleniyor',
    heading: 'Teklif listesi onayınıza sunuldu',
    intro: `<p style="margin:0;">${mailStrong(actor.name)}, ${mailStrong(
      request.title
    )} talebine gelen tedarikçi tekliflerini değerlendirdi ve onayınıza iletti.</p>`,
    facts: [
      { label: 'Talep', value: request.title },
      { label: 'Onaya sunan', value: actor.name },
      ...quotedVendorFacts(decision),
    ],
    actionPath: requestLink(requestId),
    actionLabel: 'Talebi incele ve onayla',
    tone: decision.requiresExecutiveApproval ? 'warning' : 'neutral',
    teamCc: true,
  });

  return { ...updated, decision };
};

/**
 * Personel, yetkiliye gönderdiği talebi henüz karar verilmeden geri çeker.
 * Teklif formları yeniden açılır (VENDOR_QUOTED / SENT_TO_VENDOR).
 */
export const withdrawFromManagerApproval = async (requestId, actor, note = null) => {
  const request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  assertStatus(
    request,
    ['PENDING_MANAGER_APPROVAL'],
    'Yalnızca yetkili onayındaki talepler geri çekilebilir.',
  );

  if (actor.role !== 'ADMIN' && actor.subRole === 'MANAGER') {
    const err = new Error('Yetkili onayındaki talebi geri çekmek personel işlemi için ayrılmıştır.');
    err.statusCode = 403;
    throw err;
  }

  const hasAnyQuote = (request.items || []).some((item) => (item.quotes || []).length > 0);
  const nextStatus = hasAnyQuote ? 'VENDOR_QUOTED' : 'SENT_TO_VENDOR';

  const updated = await prisma.$transaction(async (tx) => {
    await tx.requestVendorAssignment.updateMany({
      where: { requestId },
      data: { shippingCostTRY: null },
    });
    return tx.procurementRequest.update({
      where: { id: requestId },
      data: { status: nextStatus, avgShippingCostTRY: null },
    });
  });

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      action: 'WITHDRAW_FROM_MANAGER',
      note:
        note ||
        `${actor.name} talebi yetkili onayından geri çekti. Tedarikçi teklifleri yeniden düzenlenebilir.`,
    },
  });

  const managers = await findUnitManagers(purchasingModuleOf(request));
  await notifyUsers(
    managers,
    `"${request.title}" talebi ${actor.name} tarafından yetkili onayından geri çekildi.`,
    requestLink(requestId),
  );

  return updated;
};

const assertManagerInboxActor = (actor) => {
  if (actor?.role === 'ADMIN') return;
  if (
    actor?.role === 'PURCHASING' &&
    actor?.moduleId === MODULE.SATIN_ALMA &&
    actor?.subRole === 'MANAGER'
  ) {
    return;
  }
  throw forbid('Limit altı onay kutusu satın alma birimi yetkilisine açıktır.', 403);
};

const managerInboxStatusesFor = (request) => {
  const statuses = ['VENDOR_QUOTED', 'PENDING_MANAGER_APPROVAL'];
  if (isHandedToSatinAlma(request)) statuses.push('VENDOR_APPROVED', 'IN_PRODUCTION');
  return statuses;
};

const requestHasPricedQuote = (request) => {
  const displayed = attachMarketQuotesForDisplay(request);
  return (displayed.items || []).some((item) =>
    (item.quotes || []).some((q) => q.price !== null && q.price !== undefined),
  );
};

const managerUnderLimitWhere = () => ({
  AND: [
    {
      OR: [
        { moduleId: MODULE.SATIN_ALMA },
        { purchasingResponsibleModuleId: MODULE.SATIN_ALMA },
      ],
    },
    {
      OR: [
        { status: { in: ['VENDOR_QUOTED', 'PENDING_MANAGER_APPROVAL'] } },
        {
          purchasingResponsibleModuleId: MODULE.SATIN_ALMA,
          status: { in: ['VENDOR_APPROVED', 'IN_PRODUCTION'] },
        },
      ],
    },
  ],
});

/**
 * Satın alma yetkilisinin limit altı kuyruğu. Üst yönetim kutusunun kartıyla aynı biçim;
 * tutarı limitin altında kalan (veya en az bir carisi limit altında olan) talepler.
 */
export const getManagerUnderLimitInbox = async (actor) => {
  assertManagerInboxActor(actor);
  const rows = await prisma.procurementRequest.findMany({
    where: managerUnderLimitWhere(),
    include: APPROVAL_REQUEST_INCLUDE,
    orderBy: { updatedAt: 'asc' },
  });
  const pending = [];
  for (const row of rows) {
    if (!usesSatinAlmaApprovalChain(row)) continue;
    if (!requestHasPricedQuote(row)) continue;
    const decision = await getApprovalDecision(row);
    const hasUnderVendor = (decision.vendors || []).some(
      (v) => Number(v.quotedItemCount) > 0 && !v.exceedsLimit,
    );
    if (decision.requiresExecutiveApproval && !hasUnderVendor) continue;
    const card = await buildOverLimitInboxCard(row);
    card.kind = 'OVER_LIMIT';
    pending.push(card);
  }
  return { pendingCount: pending.length, pending };
};

/**
 * Limit altı karar sayfası: kalem seçimini yazar, mevcut yetkili onayını çalıştırır,
 * ardından personele otomatik yönlendirir. Limit aşılırsa durum değişmez.
 */
export const approveManagerUnderLimit = async (
  requestId,
  actor,
  note = null,
  choices = null,
  vendorShippingCosts = [],
) => {
  assertManagerInboxActor(actor);
  let request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  assertStatus(
    request,
    managerInboxStatusesFor(request),
    'Bu talep limit altı onay kutusunda değil.',
  );
  if (!requestHasPricedQuote(request)) {
    const err = new Error('Tedarikçilerden henüz fiyat gelmedi; talep onaylanamaz.');
    err.statusCode = 409;
    throw err;
  }

  const prospectivePicks = Array.isArray(choices)
    ? choices
        .filter((c) => c && typeof c.itemId === 'string')
        .map((c) => {
          const vendorId = c.vendorId === undefined ? null : c.vendorId;
          return {
            itemId: c.itemId,
            chosenVendorId:
              typeof vendorId === 'string' && !isMarketColumnId(vendorId) ? vendorId : null,
            chosenMarketSourceId:
              typeof vendorId === 'string' && isMarketColumnId(vendorId)
                ? parseMarketSourceId(vendorId)
                : null,
          };
        })
    : null;
  const previewRequest = prospectivePicks
    ? { ...request, itemVendorPicks: prospectivePicks }
    : request;
  const preview = await getApprovalDecision(previewRequest);
  if (preview.requiresExecutiveApproval) {
    const err = new Error(
      `Bu seçimin tutarı (${formatMoney(preview.totalTRY)}) parasal onay limitini (${formatMoney(preview.limitAmount)}) aşıyor. Talep sayfasından üst yönetime gönderin.`,
    );
    err.statusCode = 409;
    throw err;
  }

  if (prospectivePicks && prospectivePicks.length) {
    await upsertItemVendorPicks(requestId, actor.id, choices);
  }

  const approved = await managerApprove(requestId, actor, note, {
    approvedVendorId: null,
    vendorShippingCosts,
    dispatchNotices: true,
  });

  if (approved.isEscalated) {
    return {
      request: approved,
      decision: approved.decision,
      escalated: true,
      routed: false,
      inbox: await getManagerUnderLimitInbox(actor),
      kind: 'UNDER_LIMIT',
    };
  }

  let routed = null;
  let routeError = null;
  try {
    routed = await routeToStaff(requestId, actor, null, null);
  } catch (err) {
    routeError = err?.message || 'Personele otomatik yönlenemedi.';
  }

  return {
    request: approved,
    decision: approved.decision,
    escalated: false,
    routed: Boolean(routed),
    routedTo: routed?.assignedTo
      ? { id: routed.assignedTo.id, name: routed.assignedTo.name }
      : null,
    routeError,
    inbox: await getManagerUnderLimitInbox(actor),
    kind: 'UNDER_LIMIT',
  };
};

export const rejectManagerUnderLimit = async (requestId, actor, note = null) => {
  assertManagerInboxActor(actor);
  const request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  if (request.status !== 'PENDING_MANAGER_APPROVAL') {
    const err = new Error('Yalnızca yetkili onayına gönderilmiş talepler personele iade edilir.');
    err.statusCode = 409;
    throw err;
  }
  const updated = await rejectRequest(requestId, actor, note);
  return {
    request: updated,
    inbox: await getManagerUnderLimitInbox(actor),
    kind: 'UNDER_LIMIT',
  };
};

export const managerApprove = async (
  requestId,
  actor,
  note = null,
  { approvedVendorId = null, extraEmails = [], includeCanonical = true, vendorShippingCosts = [], dispatchNotices = true } = {},
) => {
  if (actor.role !== 'ADMIN' && actor.subRole !== 'MANAGER') {
    const err = new Error(
      'Teklif onaylama yetkiniz bulunmamaktadır. Teklifleri yalnızca Satın Alma Birimi Yetkilisi veya Sistem Yöneticisi onaylayabilir.'
    );
    err.statusCode = 403;
    throw err;
  }

  let request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  const managerStatuses = ['PENDING_MANAGER_APPROVAL', 'VENDOR_QUOTED'];
  if (isHandedToSatinAlma(request)) managerStatuses.push('VENDOR_APPROVED', 'IN_PRODUCTION');
  assertStatus(
    request,
    managerStatuses,
    'Bu talep henüz onaylanacak durumda değil. Teklifler geldikten sonra yetkili doğrudan onaylayabilir.',
  );

  if (request.status === 'VENDOR_QUOTED') {
    const hasAnyQuote = (request.items || []).some((item) => (item.quotes || []).length > 0);
    if (!hasAnyQuote) {
      const err = new Error('Tedarikçilerden henüz fiyat gelmedi; talep onaylanamaz.');
      err.statusCode = 409;
      throw err;
    }
    const shippingUpdates = collectExcludedShippingUpdates(request, vendorShippingCosts);
    if (shippingUpdates.length) {
      await prisma.$transaction(async (tx) => {
        await tx.procurementRequest.update({
          where: { id: requestId },
          data: { avgShippingCostTRY: null },
        });
        await persistShippingUpdates(tx, requestId, shippingUpdates);
      });
      request = await loadRequestForApproval(requestId);
    }
  }

  const vendorId =
    typeof approvedVendorId === 'string' && approvedVendorId.trim()
      ? approvedVendorId.trim()
      : null;

  if (vendorId) {
    // Seçilen sütunun fiyat vermediği kalemler en uygun fiyatlı sütunla tamamlanır;
    // böylece eksik teklif sırf eksik olduğu için limit altına düşmez.
    const { rates } = await resolveRatesForRequest(request);
    const bestByItem = bestColumnByItem(request, rates);
    let ownItemIds;
    if (isMarketColumnId(vendorId)) {
      const sourceId = parseMarketSourceId(vendorId);
      const src = (request.marketSources || []).find((s) => s.id === sourceId);
      if (!src) {
        const err = new Error('Seçilen online satıcı bu talebe ait değil.');
        err.statusCode = 400;
        throw err;
      }
      ownItemIds = new Set((src.quotes || []).map((q) => q.itemId));
    } else {
      const assigned = (request.assignments || []).some((a) => a.vendorId === vendorId);
      if (!assigned) {
        const err = new Error('Seçilen tedarikçi bu talebe atanmamış.');
        err.statusCode = 400;
        throw err;
      }
      ownItemIds = new Set(
        (request.items || [])
          .filter((item) =>
            (item.quotes || []).some(
              (q) => q.vendorId === vendorId && q.price !== null && q.price !== undefined,
            ),
          )
          .map((item) => item.id),
      );
    }
    const choices = (request.items || []).map((item) => ({
      itemId: item.id,
      vendorId: ownItemIds.has(item.id) ? vendorId : bestByItem.get(item.id)?.columnId || null,
    }));
    await upsertItemVendorPicks(requestId, actor.id, choices);
    request = await loadRequestForApproval(requestId);
  }

  const decision = await getApprovalDecision(request);

  // Limit aşılıyorsa yetkili tek başına onaylayamaz; kayıt üst yönetim onayına yükseltilir.
  const isEscalated = decision.requiresExecutiveApproval;
  if (isEscalated) {
    const canonical = await canonicalExecutiveEmail();
    const extras = await resolveExtraCcEmails(extraEmails, canonical);
    const sendCanonical = includeCanonical !== false && Boolean(canonical);
    if (!sendCanonical && !extras.length) {
      const err = new Error('Üst yönetim kutusuna göndermek için en az bir alıcı seçin.');
      err.statusCode = 400;
      throw err;
    }
  }
  const newStatus = isEscalated ? 'PENDING_ADMIN_APPROVAL' : 'APPROVED_FOR_PURCHASE';

  const updated = await prisma.procurementRequest.update({
    where: { id: requestId },
    data: { status: newStatus },
  });

  const totalText = formatMoney(decision.totalTRY);
  const limitText = formatMoney(decision.limitAmount);
  const vendorLabel =
    vendorId &&
    (decision.vendors?.find((v) => v.vendorId === vendorId)?.vendorName ||
      request.assignments?.find((a) => a.vendorId === vendorId)?.vendor?.name);

  const defaultNote = isEscalated
    ? `Satın Alma Birimi Yetkilisi ${actor.name} teklifleri inceledi; teklif toplamı (${totalText}) parasal onay limitini (${limitText}) aştığı için onay yetkisi dışında kaldı ve üst yönetim onayına yükseltildi.${rateNote(decision)}`
    : `Satın Alma Birimi Yetkilisi ${actor.name} teklifleri onayladı (${totalText})${vendorLabel ? ` — seçilen cari: ${vendorLabel}` : ''}; tutar parasal onay limitinin (${limitText}) altında.${rateNote(decision)}`;

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      action: isEscalated ? 'MANAGER_APPROVE_ESCALATED' : 'MANAGER_APPROVE',
      note: note?.trim()
        ? isEscalated
          ? `${defaultNote}\n<<<YETKILI_NOT>>>\n${note.trim()}`
          : `${defaultNote} Not: ${note.trim()}`
        : defaultNote,
    },
  });

  if (dispatchNotices && isEscalated) {
    // Portal içi uyarı (sistem ADMIN’leri); e-posta yalnız executiveEmail + OVER_LIMIT kanalı
    const approvers = await findExecutiveApprovers();
    await notifyUsers(
      approvers,
      `"${request.title}" talebi onay limitini aştı (${totalText} / limit ${limitText}) ve üst yönetim onayına yükseltildi.`,
      requestLink(requestId),
    );

    const mailResult = await sendOverLimitInboxMailForRequest({
      request,
      decision,
      escalatedByName: actor.name,
      extraEmails,
      includeCanonical,
    });
    if (!mailResult.sent) {
      console.warn(
        `⚠️  ${requestId} üst yönetim onay kutusu e-postası gönderilemedi (${mailResult.reason || 'smtp'}).`,
      );
    }

    // Üst yönetim mailindeki onay bağlantısı ekiple paylaşılmaz; ekip ayrı, girişli bağlantıyla bilgilenir.
    const submitter = await findSubmitter(request);
    await sendWorkflowMail({
      to: submitter?.email ? [submitter.email] : [],
      teamCc: true,
      subject: mailSubject('Üst yönetim onayına gönderildi', request.title),
      badge: 'Üst yönetim onayı bekleniyor',
      heading: 'Limit aşan teklif üst yönetime iletildi',
      intro: `<p style="margin:0;">${mailStrong(actor.name)}, ${mailStrong(
        request.title
      )} talebindeki teklif toplamı onay limitini aştığı için kaydı üst yönetim onayına gönderdi.</p>`,
      facts: [
        { label: 'Talep', value: request.title },
        { label: 'Gönderen', value: actor.name },
        { label: 'Teklif toplamı (TL karşılığı)', value: totalText, strong: true },
        { label: 'Onay limiti', value: limitText },
      ],
      actionPath: requestLink(requestId),
      actionLabel: 'Talebi aç',
      tone: 'warning',
    });
  } else if (dispatchNotices) {
    const submitter = await findSubmitter(request);
    await notifyUsers(
      [submitter].filter(Boolean),
      `"${request.title}" talebi ${actor.name} tarafından onaylandı (${totalText}). Satın alma işlemlerine başlayabilirsiniz.`,
      requestLink(requestId)
    );
    await sendWorkflowMail({
      to: submitter?.email,
      subject: mailSubject('Onaylandı', request.title),
      badge: 'Yetkili onayı verildi',
      heading: 'Teklif listesi onaylandı',
      intro: `<p style="margin:0;">${mailStrong(actor.name)}, ${mailStrong(
        request.title
      )} talebindeki teklif listesini onayladı. Sipariş süreci satın alma birimine aktarıldı.</p>`,
      facts: [
        { label: 'Talep', value: request.title },
        { label: 'Onaylayan', value: actor.name },
        { label: 'Onaylanan tutar (TL karşılığı)', value: totalText, strong: true },
      ],
      actionPath: requestLink(requestId),
      actionLabel: 'Talebi aç',
      tone: 'success',
      teamCc: true,
    });

    // Limit altında onay: üst yönetime (executiveEmail) bilgilendirme — onay gerekmez.
    await sendUnderLimitExecutiveNotice({
      request,
      decision,
      actor,
      managerNote: note?.trim() || null,
      vendorLabel: vendorLabel || null,
      totalText,
      limitText,
    });
  }

  return {
    ...updated,
    isEscalated,
    decision,
    totalAmount: decision.totalTRY,
    limitAmount: decision.limitAmount,
    message: isEscalated
      ? `Teklif toplamı (${totalText}) parasal onay limitini (${limitText}) aştığı için tarafınızca onaylanamadı. Kayıt üst yönetim onayına iletildi.`
      : `Teklifler başarıyla onaylandı (${totalText}). Sipariş satın alma birimine iletildi.`,
  };
};

export const adminApprove = async (requestId, actor, note = null) => {
  if (actor.role !== 'ADMIN') {
    const err = new Error('Limit aşan teklifleri yalnızca üst yönetim / sistem yöneticisi onaylayabilir.');
    err.statusCode = 403;
    throw err;
  }

  const request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  assertStatus(
    request,
    ['PENDING_ADMIN_APPROVAL'],
    'Bu talep üst yönetim onayı aşamasında değil; yalnızca parasal limiti aşan ve yetkili tarafından yükseltilen talepler onaylanabilir.'
  );

  const decision = await getApprovalDecision(request);
  const totalText = formatMoney(decision.totalTRY);
  const limitText = formatMoney(decision.limitAmount);

  const updated = await prisma.procurementRequest.update({
    where: { id: requestId },
    data: { status: 'APPROVED_FOR_PURCHASE' },
  });

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      action: 'ADMIN_APPROVE',
      note: appendDecisionBasis(
        note ||
          `Üst Yönetim (${actor.name}) parasal onay limitini (${limitText}) aşan ${totalText} tutarlı teklifi onayladı. Sipariş satın alma işlemleri için Satın Alma Birimine iletildi.${rateNote(decision)}`,
        request,
      ),
    },
  });

  const [managers, submitter] = await Promise.all([findUnitManagers(purchasingModuleOf(request)), findSubmitter(request)]);
  const audience = [...managers, submitter].filter(Boolean);
  const uniqueAudience = [...new Map(audience.map((u) => [u.id, u])).values()];

  await notifyUsers(
    uniqueAudience,
    `"${request.title}" talebi üst yönetim tarafından onaylandı (${totalText}). Satın alma işlemlerine başlanabilir.`,
    requestLink(requestId)
  );
  await sendWorkflowMail({
    to: uniqueAudience.map((u) => u.email),
    subject: mailSubject('Üst yönetim onayı verildi', request.title),
    badge: 'Üst yönetim onayı',
    heading: 'Limit aşan teklif onaylandı',
    intro: `<p style="margin:0;">${mailStrong(actor.name)}, ${mailStrong(
      request.title
    )} talebindeki limit aşan teklif toplamını onayladı. Kayıt satın alma birimine iade edilmiştir.</p>`,
    facts: [
      { label: 'Talep', value: request.title },
      { label: 'Onaylayan', value: actor.name },
      { label: 'Onaylanan tutar (TL karşılığı)', value: totalText, strong: true },
    ],
    actionPath: requestLink(requestId),
    actionLabel: 'Talebi aç',
    tone: 'success',
    teamCc: true,
    cc: EXECUTIVE_APPROVAL_CC,
  });

  return { ...updated, decision };
};

export const rejectRequest = async (requestId, actor, note = null) => {
  const request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  assertStatus(
    request,
    ['PENDING_MANAGER_APPROVAL', 'PENDING_ADMIN_APPROVAL', 'RETURNED_TO_MANAGER'],
    'Bu talep onay aşamasında olmadığı için iade edilemez.'
  );

  const isExecutiveDecision = request.status === 'PENDING_ADMIN_APPROVAL';
  if (isExecutiveDecision && actor.role !== 'ADMIN') {
    const err = new Error('Üst yönetim onayındaki bir talep hakkında yalnızca üst yönetim karar verebilir.');
    err.statusCode = 403;
    throw err;
  }
  if (!isExecutiveDecision && actor.role !== 'ADMIN' && actor.subRole !== 'MANAGER') {
    const err = new Error('Teklif iade etme yetkiniz bulunmamaktadır.');
    err.statusCode = 403;
    throw err;
  }

  if (isExecutiveDecision && (request.moduleId || '') === 'SATIN_ALMA') {
    return returnOverLimitToSatinAlmaManager(request, {
      actorName: `Üst Yönetim (${actor.name})`,
      note,
      actorUserId: actor.id,
    });
  }

  const submitter = await findSubmitter(request);

  const updated = await prisma.procurementRequest.update({
    where: { id: requestId },
    data: {
      status: 'VENDOR_QUOTED',
      assignedToId: submitter?.id ?? request.assignedToId ?? null,
    },
  });

  const roleText = isExecutiveDecision ? 'Üst Yönetim' : 'Satın Alma Birimi Yetkilisi';
  const defaultRejectNote = `${roleText} (${actor.name}) teklif listesini onaylamadı; kayıt yeniden değerlendirilmek üzere Satın Alma Birimi Personeline iade edildi.`;
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      targetUserId: submitter?.id || null,
      action: isExecutiveDecision ? 'ADMIN_REJECT' : 'REJECT_TO_STAFF',
      note: note?.trim()
        ? `${defaultRejectNote} Not: ${note.trim()}`
        : defaultRejectNote,
    },
  });

  await notifyUsers(
    [submitter].filter(Boolean),
    `"${request.title}" talebi ${roleText.toLowerCase()} tarafından onaylanmadı ve size iade edildi.`,
    requestLink(requestId)
  );
  await sendWorkflowMail({
    to: submitter?.email,
    subject: mailSubject('Onaylanmadı', request.title),
    badge: 'Teklif iade edildi',
    heading: 'Teklif listesi onaylanmadı',
    intro: `<p style="margin:0;">${mailStrong(roleText)} (${mailStrong(actor.name)}), ${mailStrong(
      request.title
    )} talebindeki teklif listesini onaylamadı. Kayıt yeniden değerlendirilmek üzere size iade edildi.</p>`,
    facts: [
      { label: 'Talep', value: request.title },
      { label: 'Karar veren', value: `${actor.name} — ${roleText}` },
      ...(note ? [{ label: 'Gerekçe', value: note }] : []),
    ],
    actionPath: requestLink(requestId),
    actionLabel: 'Talebi aç',
    tone: 'danger',
    teamCc: true,
  });

  return updated;
};

export const routeToStaff = async (requestId, actor, targetUserId = null, note = null) => {
  const request = await loadRequestForApproval(requestId);
  assertSatinAlmaApprovalActor(request, actor);
  assertStatus(
    request,
    ['APPROVED_FOR_PURCHASE', 'RETURNED_TO_MANAGER'],
    'Yönlendirme yalnızca onaylanmış talepler için yapılabilir.'
  );

  const resolveAutoTarget = async () => {
    const prefer = async (userId) => {
      if (!userId) return null;
      return prisma.user.findFirst({
        where: {
          id: userId,
          isActive: true,
          role: { in: ['PURCHASING', 'ADMIN'] },
        },
        select: { id: true, name: true, email: true, subRole: true },
      });
    };

    // Öncelik: onaya sunan personel (SUBMIT_TO_MANAGER) → atanan → oluşturan.
    // Yetkili (yönlendirmeyi yapan) otomatik hedef olmasın; işi sunan personele dönsün.
    const submitter = await findSubmitter(request);
    const orderedIds = [
      submitter?.id,
      request.assignedToId,
      request.createdById,
    ].filter(Boolean);

    const uniqueIds = [...new Set(orderedIds)];
    const resolved = [];
    for (const uid of uniqueIds) {
      const user = await prefer(uid);
      if (user) resolved.push(user);
    }
    if (!resolved.length) return null;

    const notActor = resolved.find((u) => u.id !== actor.id);
    return notActor || resolved[0];
  };

  let target = null;
  if (targetUserId && typeof targetUserId === 'string' && targetUserId.trim()) {
    target = await prisma.user.findFirst({
      where: { id: targetUserId.trim(), isActive: true, role: { in: ['PURCHASING', 'ADMIN'] } },
      select: { id: true, name: true, email: true, subRole: true },
    });
  } else {
    target = await resolveAutoTarget();
  }

  if (!target) {
    const err = new Error(
      'Yönlendirilecek satın alma personeli bulunamadı. Talepte atanan veya onay sürecini başlatan personel yok.',
    );
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.procurementRequest.update({
    where: { id: requestId },
    data: { assignedToId: target.id, status: 'APPROVED_FOR_PURCHASE' },
    include: { assignedTo: { select: { id: true, name: true, email: true } } },
  });

  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor.id,
      targetUserId: target.id,
      action: 'ROUTE_TO_STAFF',
      note: note || `${actor.name}, satın alma işlemini ${target.name} adlı personele yönlendirdi.`,
    },
  });

  await notifyUsers(
    [target],
    `"${request.title}" talebinin satın alma işlemi size yönlendirildi.`,
    requestLink(requestId)
  );
  await sendWorkflowMail({
    to: target.email,
    subject: mailSubject('Size yönlendirildi', request.title),
    badge: 'Satın alma yönlendirmesi',
    heading: 'Onaylanan sipariş size yönlendirildi',
    intro: `<p style="margin:0;">${mailStrong(actor.name)}, onaylanan ${mailStrong(
      request.title
    )} talebinin satın alma işlemini size yönlendirdi.</p>`,
    facts: [
      { label: 'Talep', value: request.title },
      { label: 'Yönlendiren', value: actor.name },
    ],
    actionPath: requestLink(requestId),
    actionLabel: 'Talebi aç',
    tone: 'neutral',
    teamCc: true,
  });

  return updated;
};

export const completePurchase = async (
  requestId,
  actor,
  note = null,
  { sendWarehouseMail = false, warehouseUserIds = null, dispatchNotices = true } = {},
) => {
  const request = await loadRequestForApproval(requestId);
  assertSameModuleWriter(request, actor);
  const satinAlmaChain = usesSatinAlmaApprovalChain(request);
  let fromStatuses = ['APPROVED_FOR_PURCHASE'];
  if (!satinAlmaChain) {
    const [approvalHistories, vendorActivityLogs] = await Promise.all([
      prisma.procurementApprovalHistory.findMany({ where: { requestId }, orderBy: { createdAt: 'desc' } }),
      prisma.vendorActivityLog.findMany({ where: { requestId } }),
    ]);
    const assessment = assessPriorExecutiveApproval({ ...request, approvalHistories, vendorActivityLogs });
    if (!assessment.valid) {
      const err = new Error(assessment.reason);
      err.statusCode = 409;
      throw err;
    }
    fromStatuses = isYedekParcaModule(request.moduleId)
      ? ['VENDOR_APPROVED', 'IN_PRODUCTION']
      : ['APPROVED_FOR_PURCHASE'];
  }
  assertStatus(
    request,
    fromStatuses,
    satinAlmaChain
      ? 'Satın alma yalnızca onay süreci tamamlanmış talepler için kapatılabilir.'
      : 'Satın alma, geçerli üst yönetim kararından sonraki aşamada kapatılabilir.'
  );

  const alreadyFrozen = Boolean(request.fxFrozenAt && request.fxRatesJson);
  let fxPatch = {};
  if (!alreadyFrozen) {
    const rateInfo = await getRatesToTRY({ force: true });
    const now = new Date();
    fxPatch = {
      fxRatesJson: normalizeRatesToTRY(rateInfo.rates),
      fxSource: rateInfo.source,
      fxFetchedAt: rateInfo.fetchedAt instanceof Date ? rateInfo.fetchedAt : now,
      fxFrozenAt: now,
    };
  }

  const snapshotRows = await collectAwardedPriceRows(requestId, 'COMPLETED');
  const updated = await prisma.$transaction((tx) =>
    writePurchaseClose(tx, {
      requestId,
      fxPatch,
      snapshotRows,
      fromStatuses,
      history: {
        requestId,
        actorUserId: actor.id,
        action: 'COMPLETE',
        note:
          note ||
          `${actor.name} satın alma işlemini tamamladı. Fatura yüklemesi bekleniyor.`,
      },
    })
  );

  let warehouseResult = null;
  if (sendWarehouseMail) {
    try {
      warehouseResult = await sendWarehouseDispatchList(requestId, actor, {
        userIds: warehouseUserIds,
        note:
          typeof note === 'string' && note.trim()
            ? note.trim().slice(0, 1000)
            : `Mal kabul için irsaliye listesi. Gönderen: ${actor?.name || 'Satın alma'}`,
      });
    } catch (err) {
      console.error('warehouse dispatch:', err?.message || err);
    }
  }

  if (dispatchNotices) {
    const managers = await findUnitManagers(purchasingModuleOf(request));
    await notifyUsers(
      managers,
      `"${request.title}" talebinin satın alma işlemi ${actor.name} tarafından tamamlandı.`,
      requestLink(requestId)
    );
  }

  if (satinAlmaChain && dispatchNotices) {
    await notifyApprovedVendors(requestId, actor);
  }

  return { ...updated, warehouseSent: Boolean(warehouseResult?.sent), warehouse: warehouseResult };
};

/** Seçim yapılmışsa sipariş verilen kalemler, yapılmamışsa tüm kalemler faturalanır. */
const invoiceableItemIds = (request) => {
  const items = request.items || [];
  const picked = new Set(
    (request.itemVendorPicks || [])
      .filter((p) => p.chosenVendorId || p.chosenMarketSourceId)
      .map((p) => p.itemId),
  );
  const ids = items.map((i) => i.id);
  return picked.size ? ids.filter((id) => picked.has(id)) : ids;
};

/** Faturalanacak her kalemin en az bir faturası varsa invoiceUploadedAt dolar, yoksa boşalır. */
const syncInvoiceCompletion = async (requestId) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: {
      invoiceUploadedAt: true,
      items: { select: { id: true, invoiceLinks: { select: { id: true }, take: 1 } } },
      itemVendorPicks: { select: { itemId: true, chosenVendorId: true, chosenMarketSourceId: true } },
    },
  });
  const needed = invoiceableItemIds(request);
  const covered = new Set(
    (request.items || []).filter((i) => i.invoiceLinks.length > 0).map((i) => i.id),
  );
  const done = needed.length > 0 && needed.every((id) => covered.has(id));
  const invoiceUploadedAt = done ? request.invoiceUploadedAt || new Date() : null;
  if (Boolean(request.invoiceUploadedAt) !== done) {
    await prisma.procurementRequest.update({ where: { id: requestId }, data: { invoiceUploadedAt } });
  }
  return { invoiceUploadedAt, invoicedItemCount: needed.filter((id) => covered.has(id)).length, invoiceableItemCount: needed.length };
};

/** Satın alma faturası yükleme (COMPLETED sonrası). Her dosya seçilen kalemlere bağlanır. */
export const uploadInvoice = async (requestId, files, actor = null, itemIds = []) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      moduleId: true,
      purchasingResponsibleModuleId: true,
      items: { select: { id: true, productName: true } },
      itemVendorPicks: { select: { itemId: true, chosenVendorId: true, chosenMarketSourceId: true } },
    },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  if (request.status !== 'COMPLETED') {
    const err = new Error('Fatura yalnızca satın alma tamamlandıktan sonra yüklenebilir.');
    err.statusCode = 409;
    throw err;
  }
  if (!files?.length) {
    const err = new Error('Fatura dosyası seçilmedi.');
    err.statusCode = 400;
    throw err;
  }
  const ownItemIds = new Set(request.items.map((i) => i.id));
  const selected = [...new Set((Array.isArray(itemIds) ? itemIds : []).map(String))].filter((id) =>
    ownItemIds.has(id),
  );
  if (!selected.length) {
    const err = new Error('Faturanın ait olduğu kalemleri işaretleyin.');
    err.statusCode = 400;
    throw err;
  }

  const out = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const file of files) {
      const rel = path.relative(process.cwd(), file.path).replace(/\\/g, '/');
      const row = await tx.attachment.create({
        data: {
          requestId,
          vendorId: null,
          kind: 'INVOICE',
          filename: path.basename(file.path),
          originalName: decodeMultipartOriginalName(file.originalname) || file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          size: file.size,
          path: rel,
          invoiceItems: { create: selected.map((itemId) => ({ itemId })) },
        },
      });
      rows.push({
        id: row.id,
        originalName: row.originalName,
        mimeType: row.mimeType,
        size: row.size,
        kind: row.kind,
        createdAt: row.createdAt,
        invoiceItems: selected.map((itemId) => ({ itemId })),
      });
    }
    return rows;
  });

  const completion = await syncInvoiceCompletion(requestId);

  const names = request.items.filter((i) => selected.includes(i.id)).map((i) => i.productName);
  const itemText = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor?.id || null,
      action: 'INVOICE_UPLOADED',
      note: `${actor?.name || 'Kullanıcı'} faturayı yükledi (${out.map((f) => f.originalName).join(', ')}) — kalemler: ${itemText}. ${completion.invoicedItemCount}/${completion.invoiceableItemCount} kalem faturalı.`,
    },
  });

  return { files: out, ...completion };
};

export const deleteInvoice = async (requestId, attachmentId, actor = null) => {
  const request = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!request) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(request, actor);
  const att = await prisma.attachment.findFirst({
    where: { id: attachmentId, requestId, kind: 'INVOICE' },
  });
  if (!att) {
    const err = new Error('Fatura bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  await prisma.attachment.delete({ where: { id: att.id } });
  try {
    const filePath = path.isAbsolute(att.path) ? att.path : path.join(process.cwd(), att.path);
    await fs.unlink(filePath);
  } catch {
    // Dosya diskte yoksa kayıt silinmiş olması yeterli
  }
  const completion = await syncInvoiceCompletion(requestId);
  await prisma.procurementApprovalHistory.create({
    data: {
      requestId,
      actorUserId: actor?.id || null,
      action: 'INVOICE_DELETED',
      note: `${actor?.name || 'Kullanıcı'} faturayı sildi (${att.originalName}). ${completion.invoicedItemCount}/${completion.invoiceableItemCount} kalem faturalı.`,
    },
  });
  return completion;
};

const orgWorkerName = (w) => {
  if (!w) return null;
  const n = [w.firstName, w.lastName].filter(Boolean).join(' ').trim();
  return n || null;
};

/** Depocunun malı kimin istediğini görmesi için. */
const resolveWarehouseRequester = (request) => {
  const src = request?.sourceInternalRequest;
  const person =
    src?.createdBy?.name ||
    orgWorkerName(src?.shopWorker) ||
    orgWorkerName(request?.shopWorker) ||
    request?.createdBy?.name ||
    null;
  const unit =
    src?.requesterUnit ||
    src?.shopDepartment?.name ||
    request?.shopDepartment?.name ||
    null;
  return {
    requesterName: person || null,
    requesterUnit: unit || null,
    requesterLabel: [person, unit].filter(Boolean).join(' · ') || null,
  };
};

export const getWarehouseDispatchList = async (requestId) => {
  const raw = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      shopDepartment: { select: { id: true, name: true } },
      shopWorker: { select: { id: true, firstName: true, lastName: true } },
      sourceInternalRequest: {
        select: {
          requesterUnit: true,
          createdBy: { select: { id: true, name: true, email: true } },
          shopDepartment: { select: { id: true, name: true } },
          shopWorker: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      items: requestItemsQuery({
          vendorPick: {
          include: {
            vendor: { select: { id: true, name: true, contactPhone: true, contactEmail: true } },
            marketSource: { select: { id: true, channel: true, sellerName: true, url: true } },
          },
        },
        quotes: {
          include: { vendor: { select: { id: true, name: true } } },
        },
      }),
      itemVendorPicks: {
        include: {
          vendor: { select: { id: true, name: true } },
          marketSource: { select: { id: true, channel: true, sellerName: true, url: true } },
        },
      },
      assignments: {
        include: {
          vendor: { select: { id: true, name: true } },
        },
      },
      marketSources: {
        include: { quotes: true },
      },
    },
  });

  if (!raw) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }

  const request = attachMarketQuotesForDisplay(await withSortedItems(raw));
  const pickByItem = new Map((request.itemVendorPicks || []).map((p) => [p.itemId, p]));
  const assignmentByVendor = new Map((request.assignments || []).map((a) => [a.vendorId, a]));
  const vendorTotals = new Map();

  const soleApprovedVendorId = (() => {
    const ids = [
      ...new Set(
        (request.itemVendorPicks || []).map((p) => presentChosenColumnId(p)).filter(Boolean),
      ),
    ];
    if (ids.length === 1) return ids[0];
    const quotedIds = new Set();
    for (const item of request.items || []) {
      for (const q of item.quotes || []) {
        if (q.price !== null && q.price !== undefined) quotedIds.add(q.vendorId);
      }
    }
    if (quotedIds.size === 1) return [...quotedIds][0];
    return null;
  })();

  const formatCommercial = (assignment) => {
    // Kayıt yoksa veya alanlar nullsa teklif formu varsayılanları
    const isVatIncluded = assignment?.isVatIncluded ?? true;
    const isShippingIncluded = assignment?.isShippingIncluded ?? true;
    const hasMaturity = assignment?.hasMaturity ?? false;
    const vatRate = assignment?.vatRate ?? null;
    const maturityDays = assignment?.maturityDays ?? null;

    const vatLabel =
      isVatIncluded === true
        ? 'Dahil'
        : vatRate != null
          ? `Hariç (%${vatRate})`
          : 'Hariç';
    const maturityLabel =
      hasMaturity === true
        ? maturityDays != null
          ? `${maturityDays} gün`
          : 'Evet'
        : 'Hayır';
    const shippingLabel = isShippingIncluded === true ? 'Dahil' : 'Hariç';

    return {
      vatLabel,
      maturityLabel,
      shippingLabel,
      isShippingIncluded,
      isVatIncluded,
      vatRate,
      hasMaturity,
      maturityDays,
    };
  };

  const items = (request.items || []).map((item) => {
    const pick = item.vendorPick || pickByItem.get(item.id) || null;
    let vendorId = presentChosenColumnId(pick) || pick?.vendor?.id || null;
    let vendorName =
      pick?.vendor?.name ||
      (pick?.marketSource ? marketColumnName(pick.marketSource) : null);

    const quoted = (item.quotes || []).filter((q) => q.price !== null && q.price !== undefined);

    if (!vendorId) {
      if (quoted.length === 1) {
        vendorId = quoted[0].vendorId;
        vendorName = quoted[0].vendor?.name || vendorName;
      } else if (soleApprovedVendorId) {
        vendorId = soleApprovedVendorId;
      }
    }
    if (!vendorName && vendorId) {
      vendorName = assignmentByVendor.get(vendorId)?.vendor?.name || null;
    }

    let quote = vendorId ? quoted.find((q) => q.vendorId === vendorId) : null;
    // Seçilen cariye teklif yoksa ama kalemde tek teklif varsa onu kullan
    if (!quote && quoted.length === 1) {
      quote = quoted[0];
      if (!vendorId) {
        vendorId = quote.vendorId;
        vendorName = quote.vendor?.name || vendorName;
      }
    }
    const assignment = vendorId ? assignmentByVendor.get(vendorId) : null;
    const commercial = formatCommercial(assignment);

    const price = quote?.price != null ? Number(quote.price) : null;
    const currency = quote?.currency || 'TRY';
    const discountRate = quote?.discountRate != null ? Number(quote.discountRate) : 0;
    const overallDiscount = Number(assignment?.overallDiscountRate) || 0;
    let unitNet = null;
    let lineTotal = null;
    if (price != null && Number.isFinite(price)) {
      // Depo listesi teklif fiyatını gösterir. KDV ayrı sütundadır; buraya eklenmez.
      unitNet = price * (1 - discountRate / 100) * (1 - overallDiscount / 100);
      const qty = Number(item.quantity);
      if (Number.isFinite(qty)) lineTotal = unitNet * qty;
    }

    if (vendorId) {
      const prev = vendorTotals.get(vendorId) || {
        vendorId,
        vendorName: vendorName || 'Tedarikçi',
        itemCount: 0,
        ...commercial,
      };
      prev.itemCount += 1;
      if (vendorName) prev.vendorName = vendorName;
      vendorTotals.set(vendorId, prev);
    }

    const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'CHF' ? 'CHF' : '₺';
    const priceLabel =
      unitNet != null
        ? `${unitNet.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencySymbol}`
        : '—';

    return {
    id: item.id,
    serialNumber: item.serialNumber,
    stockCode: item.stockCode,
    productName: item.productName,
    quantity: item.quantity,
      unit: item.unit || 'Adet',
      secondaryQuantity: item.secondaryQuantity,
      secondaryUnit: item.secondaryUnit,
    notes: item.notes,
    category: item.category,
      vendorId,
      vendorName: vendorName || null,
      price,
      currency,
      discountRate,
      unitNet,
      lineTotal,
      priceLabel,
      vatLabel:
        quote?.vatRate != null ? `%${Number(quote.vatRate)}` : commercial.vatLabel,
      maturityLabel: commercial.maturityLabel,
      shippingLabel: commercial.shippingLabel,
      isShippingIncluded: commercial.isShippingIncluded,
      isVatIncluded: commercial.isVatIncluded,
      vatRate: quote?.vatRate != null ? Number(quote.vatRate) : commercial.vatRate,
      hasMaturity: commercial.hasMaturity,
      maturityDays: commercial.maturityDays,
    };
  });

  const requester = resolveWarehouseRequester(request);

  return {
    requestId: request.id,
    title: request.title,
    description: request.description,
    dispatchDate: new Date(),
    requesterName: requester.requesterName,
    requesterUnit: requester.requesterUnit,
    requesterLabel: requester.requesterLabel,
    items,
    vendors: [...vendorTotals.values()].sort((a, b) =>
      String(a.vendorName || '').localeCompare(String(b.vendorName || ''), 'tr', {
        sensitivity: 'base',
        numeric: true,
      }),
    ),
  };
};

/** Depo listesi e-postasının gidebileceği kayıtlı depo sorumluları. */
export const getWarehouseContacts = async () =>
  prisma.user.findMany({
    where: { subRole: 'WAREHOUSE', isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });

/**
 * Fiyatsız depo teslim listesini seçilen depo sorumlularına e-posta ile gönderir.
 * Alıcı verilmezse kayıtlı tüm aktif depo sorumluları kullanılır.
 */
export const sendWarehouseDispatchList = async (requestId, actor, { userIds, note } = {}) => {
  const requestRow = await prisma.procurementRequest.findUnique({
    where: { id: requestId },
    select: { id: true, moduleId: true, purchasingResponsibleModuleId: true },
  });
  if (!requestRow) {
    const err = new Error('Talep bulunamadı.');
    err.statusCode = 404;
    throw err;
  }
  assertSameModuleWriter(requestRow, actor);
  const dispatch = await getWarehouseDispatchList(requestId);

  const contacts = await getWarehouseContacts();
  const selected =
    Array.isArray(userIds) && userIds.length > 0
      ? contacts.filter((c) => userIds.includes(c.id))
      : contacts;

  if (selected.length === 0) {
    const err = new Error(
      contacts.length === 0
        ? 'Kayıtlı depo sorumlusu bulunamadı. Kullanıcılar ekranından "Depo Sorumlusu" unvanıyla bir kullanıcı ekleyin.'
        : 'Gönderim için en az bir depo sorumlusu seçmelisiniz.'
    );
    err.statusCode = 400;
    throw err;
  }

  const { sendWarehouseDispatchEmail } = await import('../mail/mail.service.js');
  const sent = await sendWarehouseDispatchEmail({
    recipients: selected.map((c) => ({ email: c.email, name: c.name })),
    request: {
      title: dispatch.title,
      requesterName: dispatch.requesterName,
      requesterUnit: dispatch.requesterUnit,
    },
    items: dispatch.items,
    note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 1000) : null,
    senderName: actor?.name || null,
  });

  if (!sent) {
    const err = new Error('Depo listesi e-postası gönderilemedi. SMTP ayarlarını kontrol edin.');
    err.statusCode = 502;
    throw err;
  }

  return {
    sent: true,
    recipients: selected.map((c) => ({ id: c.id, name: c.name, email: c.email })),
    message: `Depo teslim listesi ${selected.length} kişiye gönderildi.`,
  };
};

