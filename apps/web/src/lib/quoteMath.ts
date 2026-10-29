export const QUOTE_VAT_OPTIONS = [1, 10, 20] as const;

/** İskonto alanı: yalnız 0–100 (virgül/nokta). Geçersiz veya 100 üstü tuşu yoksay. */
export function acceptPercentInput(raw: string): string | null {
  if (!/^[\d,.]*$/.test(raw)) return null;
  if (raw === '' || raw === ',' || raw === '.') return raw;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return raw;
}

export type FxAssignment = {
  usdRateFixed?: boolean | null;
  usdRate?: number | null;
  eurRate?: number | null;
  chfRate?: number | null;
};

export function quoteVatFactor(vatRate: number | string | null | undefined, applyVat: boolean) {
  if (!applyVat) return 1;
  const n = typeof vatRate === 'string' ? Number(String(vatRate).replace(',', '.')) : Number(vatRate);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return 1 + n / 100;
}

/** Birim × miktar → kalem iskonto → genel iskonto → (SATIN_ALMA) KDV. */
export function quoteLineTotal({
  price,
  quantity,
  discountRate,
  vatRate,
  overallDiscountRate,
  applyVat,
}: {
  price: number;
  quantity: number;
  discountRate?: number | null;
  vatRate?: number | string | null;
  overallDiscountRate?: number | null;
  applyVat?: boolean;
}) {
  const p = Number(price) || 0;
  const qty = Number(quantity) || 0;
  const disc = Number(discountRate) || 0;
  const overall = Number(overallDiscountRate) || 0;
  return p * qty * (1 - disc / 100) * (1 - overall / 100) * quoteVatFactor(vatRate, Boolean(applyVat));
}

export function assignmentUsdTry(
  assignment: FxAssignment | null | undefined,
  fallbackUsd?: number | null,
) {
  if (assignment?.usdRateFixed && Number(assignment.usdRate) > 0) return Number(assignment.usdRate);
  const fb = Number(fallbackUsd);
  return Number.isFinite(fb) && fb > 0 ? fb : null;
}

export function assignmentEurTry(
  assignment: FxAssignment | null | undefined,
  fallbackEur?: number | null,
) {
  if (assignment?.usdRateFixed && Number(assignment.eurRate) > 0) return Number(assignment.eurRate);
  const fb = Number(fallbackEur);
  return Number.isFinite(fb) && fb > 0 ? fb : null;
}

export function assignmentChfTry(
  assignment: FxAssignment | null | undefined,
  fallbackChf?: number | null,
) {
  if (assignment?.usdRateFixed && Number(assignment.chfRate) > 0) return Number(assignment.chfRate);
  const fb = Number(fallbackChf);
  return Number.isFinite(fb) && fb > 0 ? fb : null;
}

export function ratesWithVendorUsd<T extends Record<string, number>>(
  rates: T | null | undefined,
  assignment: FxAssignment | null | undefined,
): T {
  const base = { ...(rates || ({} as T)) };
  if (assignment?.usdRateFixed && Number(assignment.usdRate) > 0) {
    (base as Record<string, number>).USD = Number(assignment.usdRate);
  }
  if (assignment?.usdRateFixed && Number(assignment.eurRate) > 0) {
    (base as Record<string, number>).EUR = Number(assignment.eurRate);
  }
  if (assignment?.usdRateFixed && Number(assignment.chfRate) > 0) {
    (base as Record<string, number>).CHF = Number(assignment.chfRate);
  }
  return base;
}
