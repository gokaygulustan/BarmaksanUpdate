export type QuoteFormDraftItem = {
  price: string;
  notes: string;
  currency: string;
  discountRate: string;
  vatRate?: string;
};

export type QuoteFormDraft = {
  quotedItems: Record<string, QuoteFormDraftItem>;
  overallDiscountRate: string;
  usdRateFixed?: boolean;
  usdRate?: string;
  eurRate?: string;
  chfRate?: string;
  quoteNote?: string;
  savedAt: number;
};

const draftKey = (token: string) => `quote-form-draft:${token}`;

export function loadQuoteFormDraft(token: string): QuoteFormDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(draftKey(token));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QuoteFormDraft;
    if (!parsed?.quotedItems || typeof parsed.overallDiscountRate !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQuoteFormDraft(token: string, draft: Omit<QuoteFormDraft, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      draftKey(token),
      JSON.stringify({ ...draft, savedAt: Date.now() } satisfies QuoteFormDraft),
    );
  } catch {
    // localStorage dolu veya gizli mod — sessizce geç
  }
}

export function clearQuoteFormDraft(token: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(draftKey(token));
  } catch {
    // ignore
  }
}

export function mergeQuoteFormDraft(
  serverItems: Record<string, QuoteFormDraftItem>,
  draftItems: Record<string, QuoteFormDraftItem>,
): Record<string, QuoteFormDraftItem> {
  const merged = { ...serverItems };
  for (const [itemId, draft] of Object.entries(draftItems)) {
    const base = merged[itemId];
    if (!base) {
      merged[itemId] = draft;
      continue;
    }
    merged[itemId] = {
      price: draft.price !== '' ? draft.price : base.price,
      notes: draft.notes || base.notes,
      currency: draft.currency || base.currency,
      discountRate: draft.discountRate !== '' ? draft.discountRate : base.discountRate,
      vatRate: draft.vatRate || base.vatRate || '20',
    };
  }
  return merged;
}

export function buildQuoteItemsFromRequest(data: {
  items: Array<{
    id: string;
    quotes?: Array<{
      vendorId: string;
      price?: number;
      notes?: string;
      currency?: string;
      discountRate?: number;
      vatRate?: number | null;
    }>;
  }>;
  myVendorId: string;
}): Record<string, QuoteFormDraftItem> {
  const initialQuotes: Record<string, QuoteFormDraftItem> = {};
  data.items.forEach((item) => {
    const myQuote = item.quotes?.find((q) => q.vendorId === data.myVendorId);
    const vat = myQuote?.vatRate;
    initialQuotes[item.id] = {
      price: myQuote?.price != null ? myQuote.price.toString().replace('.', ',') : '',
      notes: myQuote?.notes || '',
      currency: myQuote?.currency || 'TRY',
      discountRate:
        myQuote?.discountRate != null ? myQuote.discountRate.toString().replace('.', ',') : '',
      vatRate: vat === 1 || vat === 10 || vat === 20 ? String(vat) : '20',
    };
  });
  return initialQuotes;
}
