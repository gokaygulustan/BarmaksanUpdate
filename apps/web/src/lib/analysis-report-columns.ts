/** Analiz raporu / yazdır / Excel için ortak sütun anahtarları (sıra sabit). */
export const ANALYSIS_REPORT_COLUMN_KEYS = [
  'serialNumber',
  'stockCode',
  'productName',
  'notes',
  'tonnage',
  'quantity',
  'unit',
] as const;

export type AnalysisReportColumnKey = (typeof ANALYSIS_REPORT_COLUMN_KEYS)[number];

export type AnalysisReportColumnVisibility = Record<AnalysisReportColumnKey, boolean>;

export const DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY: AnalysisReportColumnVisibility = {
  serialNumber: false,
  stockCode: false,
  productName: true,
  notes: false,
  tonnage: true,
  quantity: true,
  unit: true,
};

export const ANALYSIS_REPORT_COLUMN_LABELS: Record<AnalysisReportColumnKey, string> = {
  serialNumber: 'SN',
  stockCode: 'Stok Kodu',
  productName: 'Ürün Adı',
  notes: 'Açıklama',
  tonnage: 'Tonaj',
  quantity: 'Miktar',
  unit: 'Birim',
};

export function orderedVisibleReportColumns(
  v: AnalysisReportColumnVisibility
): AnalysisReportColumnKey[] {
  return ANALYSIS_REPORT_COLUMN_KEYS.filter((k) => v[k]);
}

/** Analiz / Excel tedarikçi sütun sırası: ilk teklif değil, Türkçe alfabetik ad. */
export function compareVendorNames(a?: string | null, b?: string | null) {
  return String(a || '').localeCompare(String(b || ''), 'tr', { sensitivity: 'base', numeric: true });
}

/** # + görünür veri sütunları */
export function analysisReportFixedColumnCount(v: AnalysisReportColumnVisibility): number {
  return 1 + orderedVisibleReportColumns(v).length;
}

export const DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS = {
  showGroupTotals: true,
  showPrices: true,
  showVendorNotes: false,
};

export type AnalysisReportViewSettings = typeof DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS;

const LS_VIEW_PREFIX = 'analysisReportView:';

export function loadAnalysisReportViewSettings(requestId: string): AnalysisReportViewSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS };
  try {
    const raw = localStorage.getItem(`${LS_VIEW_PREFIX}${requestId}`);
    if (!raw) return { ...DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AnalysisReportViewSettings>;
    return { ...DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS };
  }
}

export function saveAnalysisReportViewSettings(requestId: string, v: AnalysisReportViewSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LS_VIEW_PREFIX}${requestId}`, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

const LS_PREFIX = 'analysisReportColumns:';

export function loadAnalysisReportColumnVisibility(requestId: string): AnalysisReportColumnVisibility {
  if (typeof window === 'undefined') return { ...DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY };
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${requestId}`);
    if (!raw) return { ...DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY };
    const parsed = JSON.parse(raw) as Partial<AnalysisReportColumnVisibility>;
    return { ...DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY, ...parsed };
  } catch {
    return { ...DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY };
  }
}

export function saveAnalysisReportColumnVisibility(
  requestId: string,
  v: AnalysisReportColumnVisibility
): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${LS_PREFIX}${requestId}`, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

export function excelWidthForReportColumn(key: AnalysisReportColumnKey): number {
  switch (key) {
    case 'serialNumber':
      return 12;
    case 'stockCode':
      return 16;
    case 'productName':
      return 36;
    case 'notes':
      return 28;
    case 'tonnage':
      return 14;
    case 'quantity':
      return 11;
    case 'unit':
      return 16;
    default:
      return 14;
  }
}
