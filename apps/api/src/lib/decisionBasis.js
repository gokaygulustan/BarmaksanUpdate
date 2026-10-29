/** Üst yönetim kararının ticari kapsamı. Görünen nota eklenir; ekranda kesilir. */
export const DECISION_BASIS_MARK = '<<<DECISION_BASIS>>>';

const num = (value) => {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const sameNum = (left, right) => {
  const a = num(left);
  const b = num(right);
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 0.000001;
};

const text = (value) => String(value ?? '').trim();

const pickOf = (request, item) =>
  item.vendorPick ||
  (request.itemVendorPicks || []).find((row) => row.itemId === item.id) ||
  null;

const chosenQuote = (item, vendorId) =>
  vendorId ? (item.quotes || []).find((quote) => quote.vendorId === vendorId) || null : null;

const chosenMarketQuote = (request, item, marketId) => {
  if (!marketId) return null;
  const source = (request.marketSources || []).find((row) => row.id === marketId);
  const fromSource = (source?.quotes || []).find((quote) => quote.itemId === item.id);
  if (fromSource) return fromSource;
  return (item.marketQuotes || []).find((quote) => quote.sourceId === marketId) || null;
};

/** Karar anındaki tedarikçi, ürün, miktar, fiyat ve maliyet koşulları. */
export const captureDecisionBasis = (request) => {
  const items = request?.items || [];
  const chosenVendors = new Set();
  const lines = items.map((item) => {
    const pick = pickOf(request, item);
    const vendorId = pick?.chosenVendorId || null;
    const marketId = pick?.chosenMarketSourceId || null;
    if (vendorId) chosenVendors.add(vendorId);
    const quote = chosenQuote(item, vendorId);
    const market = chosenMarketQuote(request, item, marketId);
    return {
      id: item.id,
      productName: text(item.productName),
      quantity: num(item.quantity),
      unit: text(item.unit) || 'Adet',
      secondaryQuantity: num(item.secondaryQuantity),
      secondaryUnit: item.secondaryUnit == null ? null : text(item.secondaryUnit),
      vendorId,
      marketId,
      price: quote ? num(quote.price) : null,
      currency: quote ? text(quote.currency) || 'TRY' : null,
      discountRate: quote ? num(quote.discountRate) || 0 : null,
      vatRate: quote ? num(quote.vatRate) : null,
      marketPrice: market ? num(market.price) : null,
      marketCurrency: market ? text(market.currency) || 'TRY' : null,
    };
  });
  const terms = (request?.assignments || [])
    .filter((row) => chosenVendors.has(row.vendorId))
    .map((row) => ({
      vendorId: row.vendorId,
      overallDiscountRate: num(row.overallDiscountRate) || 0,
      isShippingIncluded: row.isShippingIncluded !== false,
      shippingCostTRY: num(row.shippingCostTRY),
      isVatIncluded: Boolean(row.isVatIncluded),
      vatRate: num(row.vatRate),
      hasMaturity: Boolean(row.hasMaturity),
      maturityDays: num(row.maturityDays),
      usdRateFixed: Boolean(row.usdRateFixed),
      usdRate: num(row.usdRate),
      eurRate: num(row.eurRate),
      chfRate: num(row.chfRate),
    }));
  return { items: lines, terms };
};

export const appendDecisionBasis = (note, request) => {
  const body = text(note);
  const payload = JSON.stringify(captureDecisionBasis(request));
  return body ? `${body}\n${DECISION_BASIS_MARK}\n${payload}` : `${DECISION_BASIS_MARK}\n${payload}`;
};

export const stripDecisionBasis = (note) => {
  if (typeof note !== 'string' || !note.includes(DECISION_BASIS_MARK)) return note;
  return note.slice(0, note.indexOf(DECISION_BASIS_MARK)).trimEnd();
};

export const readDecisionBasis = (note) => {
  if (typeof note !== 'string' || !note.includes(DECISION_BASIS_MARK)) return null;
  const raw = note.slice(note.indexOf(DECISION_BASIS_MARK) + DECISION_BASIS_MARK.length).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return { broken: true };
    return parsed;
  } catch {
    return { broken: true };
  }
};

const APPROVE_ACTIONS = new Set(['EXECUTIVE_VENDOR_PICK', 'ADMIN_APPROVE']);
const REJECT_ACTIONS = new Set(['EXECUTIVE_VENDOR_PICK_REJECT', 'ADMIN_REJECT']);

const fail = (reason) => ({ valid: false, reason });

/** Üst yönetim kararı bu teklif, ürün, miktar ve fiyat için hâlâ geçerli mi. */
export const assessPriorExecutiveApproval = (request) => {
  const histories = [...(request?.approvalHistories || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const latest = histories.find((row) => APPROVE_ACTIONS.has(row.action) || REJECT_ACTIONS.has(row.action));
  if (!latest || REJECT_ACTIONS.has(latest.action)) {
    return {
      valid: false,
      reason: latest
        ? 'Üst yönetim kararı geri gönderilmiş. Eski onay satın almayı kapatmaz.'
        : 'Üst yönetim kararı kaydı yok. Eski sipariş durumu tek başına onay sayılmaz.',
    };
  }
  const executive = latest;
  const decisionAt = new Date(executive.createdAt).getTime();
  const items = request.items || [];
  const picks = items.filter((item) => {
    const pick = pickOf(request, item);
    return pick?.chosenVendorId || pick?.chosenMarketSourceId;
  });
  if (!picks.length) {
    return {
      valid: false,
      reason: 'Üst yönetim kaydı var; seçilmiş kalem tedarikçisi durmuyor.',
      decidedAt: executive.createdAt,
      action: executive.action,
    };
  }
  const basis = readDecisionBasis(executive.note);
  if (basis) {
    const compared = compareDecisionBasis(request, basis);
    return { ...compared, decidedAt: executive.createdAt, action: executive.action };
  }
  const logs = request.vendorActivityLogs || request.activityLogs || [];
  const commercialLog = logs.some((log) => {
    if (new Date(log.createdAt).getTime() <= decisionAt) return false;
    const message = String(log.message || '');
    return /birim fiyat|kalem isk|Genel iskonto/.test(message) && /→|yeni teklif/.test(message);
  });
  if (commercialLog) {
    return {
      valid: false,
      reason: 'Üst yönetim kararından sonra teklif fiyatı veya iskonto değişmiş.',
      decidedAt: executive.createdAt,
      action: executive.action,
    };
  }
  const unexplainedQuote = items.some((item) =>
    (item.quotes || []).some((quote) => {
      if (new Date(quote.updatedAt).getTime() <= decisionAt) return false;
      const vendorId = item.vendorPick?.chosenVendorId;
      if (vendorId && quote.vendorId !== vendorId) return false;
      const logged = logs.some(
        (log) => log.vendorId === quote.vendorId && new Date(log.createdAt).getTime() > decisionAt,
      );
      return !logged;
    }),
  );
  if (unexplainedQuote) {
    return {
      valid: false,
      reason: 'Üst yönetim kararından sonra seçilen teklif kaydı değişmiş.',
      decidedAt: executive.createdAt,
      action: executive.action,
    };
  }
  return {
    valid: true,
    reason: 'Üst yönetim kararı mevcut teklif, ürün, miktar ve fiyat ile örtüşüyor.',
    decidedAt: executive.createdAt,
    action: executive.action,
  };
};

/** Kayıtlı kapsam ile güncel talep aynı ticari kararı taşıyor mu. */
export const compareDecisionBasis = (request, basis) => {
  if (!basis || basis.broken) {
    return fail('Üst yönetim kararının kapsam kaydı okunamadı.');
  }
  const current = captureDecisionBasis(request);
  if (current.items.length !== basis.items.length) {
    return fail('Üst yönetim kararından sonra kalem sayısı değişmiş.');
  }
  const byId = new Map(current.items.map((item) => [item.id, item]));
  for (const frozen of basis.items) {
    const item = byId.get(frozen.id);
    if (!item) return fail('Üst yönetim kararındaki bir kalem artık durmuyor.');
    if (item.productName !== frozen.productName) {
      return fail('Üst yönetim kararından sonra ürün veya hizmet adı değişmiş.');
    }
    if (!sameNum(item.quantity, frozen.quantity) || item.unit !== frozen.unit) {
      return fail('Üst yönetim kararından sonra miktar veya birim değişmiş.');
    }
    if (!sameNum(item.secondaryQuantity, frozen.secondaryQuantity) || item.secondaryUnit !== frozen.secondaryUnit) {
      return fail('Üst yönetim kararından sonra ikincil miktar veya birim değişmiş.');
    }
    if (item.vendorId !== frozen.vendorId || item.marketId !== frozen.marketId) {
      return fail('Üst yönetim kararından sonra kalemin tedarikçi seçimi değişmiş.');
    }
    if (frozen.vendorId) {
      if (!sameNum(item.price, frozen.price) || item.currency !== frozen.currency) {
        return fail('Üst yönetim kararından sonra onaylanan fiyat veya para birimi değişmiş.');
      }
      if (!sameNum(item.discountRate, frozen.discountRate) || !sameNum(item.vatRate, frozen.vatRate)) {
        return fail('Üst yönetim kararından sonra iskonto veya KDV değişmiş.');
      }
    }
    if (frozen.marketId) {
      if (!sameNum(item.marketPrice, frozen.marketPrice) || item.marketCurrency !== frozen.marketCurrency) {
        return fail('Üst yönetim kararından sonra online fiyat veya para birimi değişmiş.');
      }
    }
  }
  const currentTerms = new Map(current.terms.map((row) => [row.vendorId, row]));
  for (const frozen of basis.terms || []) {
    const term = currentTerms.get(frozen.vendorId);
    if (!term) return fail('Üst yönetim kararındaki tedarikçi ataması durmuyor.');
    const changed =
      !sameNum(term.overallDiscountRate, frozen.overallDiscountRate) ||
      term.isShippingIncluded !== frozen.isShippingIncluded ||
      !sameNum(term.shippingCostTRY, frozen.shippingCostTRY) ||
      term.isVatIncluded !== frozen.isVatIncluded ||
      !sameNum(term.vatRate, frozen.vatRate) ||
      term.hasMaturity !== frozen.hasMaturity ||
      !sameNum(term.maturityDays, frozen.maturityDays) ||
      term.usdRateFixed !== frozen.usdRateFixed ||
      !sameNum(term.usdRate, frozen.usdRate) ||
      !sameNum(term.eurRate, frozen.eurRate) ||
      !sameNum(term.chfRate, frozen.chfRate);
    if (changed) {
      return fail('Üst yönetim kararından sonra nakliye, KDV, vade veya kur koşulu değişmiş.');
    }
  }
  return { valid: true, reason: 'Üst yönetim kararı mevcut teklif, ürün, miktar ve fiyat ile örtüşüyor.' };
};
