export const QUOTE_CURRENCIES = ['TRY', 'USD', 'EUR', 'CHF'] as const;
export const FX_CURRENCIES = ['USD', 'EUR', 'CHF'] as const;

export const FALLBACK_RATES_TO_TRY: Record<string, number> = {
  TRY: 1,
  USD: 52.5,
  EUR: 57.2,
  CHF: 59,
};

export function emptyCurrencyBag(): Record<string, number> {
  return { TRY: 0, USD: 0, EUR: 0, CHF: 0 };
}

export function currencySymbol(code: string) {
  const c = String(code || '').toUpperCase();
  if (c === 'USD') return '$';
  if (c === 'EUR') return '€';
  if (c === 'CHF') return 'CHF';
  return '₺';
}

export function isFxCurrency(code: string) {
  const c = String(code || '').toUpperCase();
  return c === 'USD' || c === 'EUR' || c === 'CHF';
}

export function hasFxSums(sums: Record<string, number> | null | undefined) {
  return FX_CURRENCIES.some((c) => (Number(sums?.[c]) || 0) > 0);
}
