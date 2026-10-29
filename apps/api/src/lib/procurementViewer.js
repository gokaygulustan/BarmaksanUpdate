/**
 * ProcurementRequest yanıtını izleyiciye göre scrub eder (rakip teklif / ek izolasyonu).
 * Mimariyi değiştirmez; getById / getByToken / list ortak kullanımı için.
 */

export const forbid = (message, statusCode = 403) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/** items[].quotes → yalnız ownVendorId (veya boş dizi) */
export const scrubItemQuotesForVendor = (items, ownVendorId) =>
  (items || []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const quotes = Array.isArray(item.quotes)
      ? item.quotes.filter((q) => q && q.vendorId === ownVendorId)
      : item.quotes;
    return { ...item, quotes };
  });

/** Yalnız kendi vendor activity log’ları */
export const scrubActivityLogsForVendor = (logs, ownVendorId) =>
  (logs || []).filter((l) => l && l.vendorId === ownVendorId);

/** Yorumlar: hedefi başka vendor olanları gizle (genel + kendi) */
export const scrubCommentsForVendor = (comments, ownVendorId) =>
  (comments || []).filter((c) => {
    if (!c) return false;
    if (!c.targetVendorId) return true;
    return c.targetVendorId === ownVendorId;
  });

/** itemVendorPicks tedarikçiye gereksiz; boşalt */
export const scrubPicksForVendor = () => [];

/**
 * SUPPLIER / public-token için ortak presenter.
 * ownVendorId zorunlu.
 */
export const presentProcurementForVendor = (request, ownVendorId, extra = {}) => {
  if (!request || !ownVendorId) return request;
  const items = scrubItemQuotesForVendor(request.items, ownVendorId);
  const attachments = (request.attachments || []).filter((a) => {
    if (!a) return false;
    if (a.kind === 'INVOICE') return false;
    if (a.vendorId && a.vendorId !== ownVendorId) return false;
    return true;
  });
  const assignments = (request.assignments || []).filter((a) => a && a.vendorId === ownVendorId);
  const {
    internalNote: _internalNote,
    shopDepartmentId: _shopDepartmentId,
    shopDepartment: _shopDepartment,
    shopWorkerId: _shopWorkerId,
    shopWorker: _shopWorker,
    ...safeRequest
  } = request;
  return {
    ...safeRequest,
    items,
    attachments,
    assignments,
    comments: scrubCommentsForVendor(request.comments, ownVendorId),
    vendorActivityLogs: scrubActivityLogsForVendor(request.vendorActivityLogs, ownVendorId),
    itemVendorPicks: scrubPicksForVendor(),
    ...extra,
  };
};

/** Public token: creator PII scrub */
export const scrubPublicCreator = (createdBy) => {
  if (!createdBy || typeof createdBy !== 'object') return createdBy;
  return {
    id: createdBy.id,
    name: createdBy.name,
    moduleId: createdBy.moduleId,
    subRole: createdBy.subRole,
  };
};

/** Para: kuruşa yuvarla (float karşılaştırmasını önlemek için) */
export const moneyCents = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100);
};

export const centsToTry = (cents) => cents / 100;
