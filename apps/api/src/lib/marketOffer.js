export const MARKET_COLUMN_PREFIX = 'mkt_';

export const MARKET_CHANNELS = ['TRENDYOL', 'HEPSIBURADA', 'N11', 'AMAZON', 'OTHER'];

export const MARKET_CHANNEL_LABELS = {
  TRENDYOL: 'Trendyol',
  HEPSIBURADA: 'Hepsiburada',
  N11: 'n11',
  AMAZON: 'Amazon',
  OTHER: 'Diğer',
};

export const MARKET_EDITABLE_STATUSES = new Set([
  'DRAFT',
  'SENT_TO_VENDOR',
  'VENDOR_QUOTED',
  'PENDING_MANAGER_APPROVAL',
  'RETURNED_TO_MANAGER',
]);

export const isMarketColumnId = (id) => String(id || '').startsWith(MARKET_COLUMN_PREFIX);

export const marketColumnId = (sourceId) => `${MARKET_COLUMN_PREFIX}${sourceId}`;

export const parseMarketSourceId = (columnId) => {
  const s = String(columnId || '');
  if (!s.startsWith(MARKET_COLUMN_PREFIX)) return null;
  const id = s.slice(MARKET_COLUMN_PREFIX.length).trim();
  return id || null;
};

export const marketChannelLabel = (channel) =>
  MARKET_CHANNEL_LABELS[String(channel || '').toUpperCase()] || 'Online';

export const marketColumnName = (source) => {
  const ch = marketChannelLabel(source?.channel);
  const seller = String(source?.sellerName || '').trim();
  return seller ? `${ch} · ${seller}` : ch;
};

export const parseHttpUrl = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  let u;
  try {
    u = new URL(withProto);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.toString();
};

export const presentMarketSource = (src) => {
  if (!src) return src;
  return {
    id: src.id,
    channel: src.channel,
    channelLabel: marketChannelLabel(src.channel),
    sellerName: src.sellerName,
    url: src.url,
    notes: src.notes || null,
    createdAt: src.createdAt,
    updatedAt: src.updatedAt,
    createdBy: src.createdBy || null,
    columnId: marketColumnId(src.id),
    columnName: marketColumnName(src),
    quotes: (src.quotes || []).map((q) => ({
      id: q.id,
      sourceId: src.id,
      itemId: q.itemId,
      price: q.price,
      currency: q.currency || 'TRY',
      url: q.url || src.url,
      notes: q.notes || null,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
    })),
    attachments: src.attachments || [],
  };
};

const toSyntheticQuote = (src, mq) => {
  const colId = marketColumnId(src.id);
  const name = marketColumnName(src);
  return {
    id: mq.id,
    price: mq.price,
    currency: mq.currency || 'TRY',
    notes: mq.notes || null,
    discountRate: 0,
    vatRate: null,
    vendorId: colId,
    vendor: { id: colId, name, isMarket: true },
    isMarket: true,
    marketSourceId: src.id,
    marketUrl: mq.url || src.url,
    marketChannel: src.channel,
    marketSellerName: src.sellerName,
    createdAt: mq.createdAt,
    updatedAt: mq.updatedAt,
  };
};

/** Analiz / detay: online fiyatları tedarikçi sütunu gibi item.quotes'a ekler. En yüksek cari toplamına girmez; seçilirse onay tutarına girer. */
export const attachMarketQuotesForDisplay = (request) => {
  if (!request) return request;
  const sources = request.marketSources || [];
  const extraByItem = new Map();
  for (const src of sources) {
    for (const mq of src.quotes || []) {
      if (!mq?.itemId) continue;
      const list = extraByItem.get(mq.itemId) || [];
      list.push(toSyntheticQuote(src, mq));
      extraByItem.set(mq.itemId, list);
    }
  }
  return {
    ...request,
    marketSources: sources.map(presentMarketSource),
    itemVendorPicks: presentVendorPicks(request.itemVendorPicks),
    items: (request.items || []).map((it) => ({
      ...it,
      quotes: [...(it.quotes || []), ...(extraByItem.get(it.id) || [])],
      vendorPick: it.vendorPick
        ? { ...it.vendorPick, chosenVendorId: presentChosenColumnId(it.vendorPick) }
        : it.vendorPick,
    })),
  };
};

export const isMarketQuoteLike = (quote) =>
  Boolean(quote?.isMarket) || isMarketColumnId(quote?.vendorId);

/** UI / API: seçilen sütun id (gerçek cari veya mkt_kaynak). */
export const presentChosenColumnId = (pick) => {
  if (!pick) return null;
  if (pick.chosenMarketSourceId) return marketColumnId(pick.chosenMarketSourceId);
  return pick.chosenVendorId || null;
};

export const presentVendorPicks = (picks) =>
  (picks || []).map((p) => ({
    ...p,
    chosenVendorId: presentChosenColumnId(p),
  }));
