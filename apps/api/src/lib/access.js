import { stripDecisionBasis } from './decisionBasis.js';

/** Üst yönetim: tedarikçi kanalı (mail/SMS/token) ve SMTP. */
export const isExecutiveUser = (user) => Boolean(user?.isExecutive);

/** Satın alma birimi (Mahmut ve ekibi). Kerem / üretim planlama dahil değil. */
export const isSatinAlmaPurchasing = (user) =>
  Boolean(user?.role === 'PURCHASING' && user?.moduleId === 'SATIN_ALMA');

export const isSatinAlmaInbox = (user) =>
  Boolean(user && (user.role === 'ADMIN' || isExecutiveUser(user) || isSatinAlmaPurchasing(user)));

/** Birim taleplerini onaylayan: satın alma birim sorumlusu veya üst yönetim. */
export const isSatinAlmaManager = (user) =>
  Boolean(
    user &&
      (isExecutiveUser(user) ||
        user.role === 'ADMIN' ||
        (isSatinAlmaPurchasing(user) && user.subRole === 'MANAGER'))
  );

/** Satın alma ve üretim personeli RFQ açamaz; önce birim yetkilisi onaylar. */
export const canCreateStandaloneRfq = (user) => {
  if (!user) return false;
  if (user.role === 'ADMIN' || isExecutiveUser(user)) return true;
  if (user.role !== 'PURCHASING') return false;
  if (user.moduleId === 'SATIN_ALMA' || user.moduleId === 'URETIM_PLANLAMA') {
    return user.subRole === 'MANAGER';
  }
  return true;
};

export const unitRequestModuleOf = (user) =>
  user?.role === 'PURCHASING' && user?.moduleId === 'URETIM_PLANLAMA' ? 'URETIM_PLANLAMA' : 'SATIN_ALMA';

/** Bu kullanıcının onayladığı birim talebi hattı. Admin her hattı görür. */
export const managesUnitModule = (user, moduleId) => {
  if (!user) return false;
  if (user.role === 'ADMIN' || isExecutiveUser(user)) return true;
  const mod = moduleId || 'SATIN_ALMA';
  return user.role === 'PURCHASING' && user.subRole === 'MANAGER' && user.moduleId === mod;
};

/** Ana yönetici / üst yönetim: sohbeti görür, görüldü bilgisinde yer almaz. */
export const isSilentChatViewer = (user) =>
  Boolean(user && (user.role === 'ADMIN' || isExecutiveUser(user)));

/** Üst yönetim veya sistem yöneticisi: tedarikçi kanalı (mail/SMS/token) ve SMTP. */
export const canSeeOutboundChannel = (user) =>
  Boolean(user && (user.role === 'ADMIN' || isExecutiveUser(user)));

/** Aktivite logundaki admin-only telefon notunu temizler / açar. */
export const scrubVendorActivityMessage = (message, viewer) => {
  const raw = String(message || '');
  if (viewer?.role === 'ADMIN') {
    return raw.replace(/ \[\[admin-phone:([^\]]+)\]\]/g, ' (Alıcı: $1)');
  }
  return raw.replace(/ \[\[admin-phone:[^\]]+\]\]/g, '');
};

export const scrubVendorActivityLogs = (logs, viewer) => {
  if (!Array.isArray(logs)) return logs;
  return logs.map((log) => {
    if (!log || typeof log !== 'object') return log;
    return { ...log, message: scrubVendorActivityMessage(log.message, viewer) };
  });
};

export const authorizeExecutive = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized: Not authenticated.' });
  }
  if (!isExecutiveUser(req.user)) {
    return res.status(403).json({
      message: 'Forbidden: Bu işlem yalnızca üst yönetim içindir.',
    });
  }
  next();
};

/** quoteToken / kısa kod ve teklif URL’sini yanıttan çıkarır (üst yönetim hariç). */
export const stripQuoteTokens = (payload, viewer) => {
  if (!payload || !viewer || canSeeOutboundChannel(viewer)) return payload;
  const stripAssignment = (a) => {
    if (!a || typeof a !== 'object') return a;
    const { quoteToken, quoteShortCode, ...rest } = a;
    return rest;
  };
  const stripOne = (row) => {
    if (!row || typeof row !== 'object') return row;
    if (!Array.isArray(row.assignments)) return row;
    return { ...row, assignments: row.assignments.map(stripAssignment) };
  };
  if (Array.isArray(payload)) return payload.map(stripOne);
  return stripOne(payload);
};

const INTERNAL_ONLY_PROC_KEYS = [
  'internalNote',
  'shopDepartmentId',
  'shopDepartment',
  'shopWorkerId',
  'shopWorker',
  'projectId',
  'project',
  'fxRatesJson',
  'fxSource',
  'fxFetchedAt',
  'fxFrozenAt',
  'marketSources',
];

const isMarketishQuote = (q) =>
  Boolean(q?.isMarket) || String(q?.vendorId || '').startsWith('mkt_');

/** Tedarikçi / public quote context: iç not ve mavi yaka alanlarını çıkarır. */
export const scrubProcurementForViewer = (payload, viewer, { forcePublic = false } = {}) => {
  const isSupplier =
    forcePublic || viewer?.role === 'SUPPLIER' || viewer?.kind === 'quote_token';
  if (!isSupplier) return payload;

  const scrubOne = (row) => {
    if (!row || typeof row !== 'object') return row;
    const next = { ...row };
    for (const key of INTERNAL_ONLY_PROC_KEYS) {
      if (key in next) delete next[key];
    }
    if (Array.isArray(next.items)) {
      next.items = next.items.map((it) => {
        if (!it || typeof it !== 'object') return it;
        const quotes = Array.isArray(it.quotes) ? it.quotes.filter((q) => !isMarketishQuote(q)) : it.quotes;
        return { ...it, quotes };
      });
    }
    if (Array.isArray(next.attachments)) {
      next.attachments = next.attachments.filter((a) => !a?.marketSourceId);
    }
    return next;
  };

  if (Array.isArray(payload)) return payload.map(scrubOne);
  return scrubOne(payload);
};

export const presentProcurementForViewer = (payload, viewer, opts) =>
  scrubProcurementForViewer(stripQuoteTokens(payload, viewer), viewer, opts);
