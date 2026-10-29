'use client';

import { SmokeText } from '@/components/SmokeText';
import { PrimaryButton, SecondaryButton } from '@/components/page/Page';
import { useMemo, useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { procurementApi, currencyApi } from '@/lib/api';
import {
  Loader2,
  ArrowLeft,
  Printer,
  CheckCircle2,
  Trash2,
  Settings,
  FileSpreadsheet,
  BadgeCheck,
} from 'lucide-react';
import { DetailSkeleton } from '@/components/page/Skeleton';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { sortRequestItems } from '@/lib/request-item-order';
import { showsProductionItemMeta, usesExecutiveDecisionInvite, usesPurchasingQuoteForm } from '@/lib/access';
import { pageTitle } from '@/lib/brand';
import { assignmentChfTry, assignmentEurTry, assignmentUsdTry, quoteLineTotal, ratesWithVendorUsd } from '@/lib/quoteMath';
import { FALLBACK_RATES_TO_TRY, currencySymbol } from '@/lib/currency';
import type { DownloadAnalysisExcelParams } from '@/lib/analysis-excel-export';
import {
  ANALYSIS_REPORT_COLUMN_KEYS,
  ANALYSIS_REPORT_COLUMN_LABELS,
  DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY,
  DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS,
  analysisReportFixedColumnCount,
  compareVendorNames,
  loadAnalysisReportColumnVisibility,
  loadAnalysisReportViewSettings,
  orderedVisibleReportColumns,
  saveAnalysisReportColumnVisibility,
  saveAnalysisReportViewSettings,
  type AnalysisReportColumnKey,
  type AnalysisReportColumnVisibility,
} from '@/lib/analysis-report-columns';
import { VendorDecisionDeck } from '@/components/analysis/VendorDecisionDeck';
import { useAuthStore } from '@/stores/useAuthStore';

const FALLBACK_RATES = FALLBACK_RATES_TO_TRY;

/** Yeni sekmede / yazdırmada kullanılır: position:fixed + body visibility hack yok (çok sayfa PDF için şart). */
const ANALYSIS_REPORT_STANDALONE_CSS = `
@page {
  size: A4 landscape;
  margin: 3mm;
}
html, body {
  margin: 0;
  padding: 0;
  background: #ffffff !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* Genişlik A4 yatay (297mm); yükseklik önizlemede içerik kadar — sabit 210mm alt boşluk bırakıyordu */
.analysis-sheet-viewport {
  width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 16px;
  box-sizing: border-box;
}
.analysis-wrapper {
  position: relative;
  width: 297mm;
  max-width: none;
  margin: 0 auto;
  padding: 0;
  background: transparent;
  box-sizing: border-box;
}
.a4-page {
  background: white;
  color: #1e293b;
  border-radius: 4px;
  box-shadow: 0 1px 15px rgba(0, 0, 0, 0.12);
  margin-bottom: 16px;
  padding: 4mm 6mm;
  width: 297mm;
  height: auto;
  min-height: 0;
  max-width: none;
  margin-left: auto;
  margin-right: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  border: 1px solid #e2e8f0;
  overflow: visible;
  position: relative;
  box-sizing: border-box;
  flex-shrink: 0;
}
/* Taban: em ile verilen inline boyutlar tr/td zincirinde doğru çözülsün (aksi halde ~16px’e göre şişer) */
.size-normal .analysis-table { font-size: 7.5px; }
.size-normal .analysis-table th { font-size: 7.5px; padding: 1px 2px; }
.size-normal .analysis-table td { font-size: 7.5px; padding: 1px 2px; }
.size-normal .analysis-table th.vendor-col-header { font-size: 6.75px; line-height: 1.15; }
.size-small .analysis-table { font-size: 7px; }
.size-small .analysis-table th { font-size: 7px; padding: 1px; }
.size-small .analysis-table td { font-size: 7px; padding: 0.5px 1px; }
.size-small .analysis-table th.vendor-col-header { font-size: 6.25px; line-height: 1.15; }
.size-xsmall .analysis-table { font-size: 6.5px; }
.size-xsmall .analysis-table th { font-size: 6px; padding: 0.5px; }
.size-xsmall .analysis-table td { font-size: 6.5px; padding: 0.5px; }
.size-xsmall .analysis-table th.vendor-col-header { font-size: 5.75px; line-height: 1.15; }
.analysis-table { width: 100%; table-layout: fixed; border-collapse: collapse; border: 1.5px solid #1e293b; }
.analysis-table th {
  text-transform: uppercase;
  font-weight: 800;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  min-height: 14px;
  height: auto;
  line-height: 1.18;
  vertical-align: middle;
  box-sizing: border-box;
}
.analysis-table td {
  vertical-align: middle;
  border: 1px solid #cbd5e1;
  overflow: hidden;
  box-sizing: border-box;
}
/* Başlık satırı: metin kesilmesin (MİKTAR vb.); yükseklik içeriğe göre */
.analysis-table thead tr.analysis-thead-row th {
  height: auto !important;
  min-height: 14px !important;
  max-height: none !important;
  overflow: visible !important;
  box-sizing: border-box !important;
  white-space: nowrap;
}
.analysis-table tbody tr.analysis-row-group td {
  height: 5.8mm !important;
  min-height: 5.8mm !important;
  max-height: 5.8mm !important;
  overflow: hidden !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.analysis-table tbody tr.analysis-row-item td {
  height: 7.1mm !important;
  min-height: 7.1mm !important;
  max-height: 7.1mm !important;
  overflow: hidden !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.analysis-table tbody tr.analysis-row-subtotal td {
  height: 5.8mm !important;
  min-height: 5.8mm !important;
  max-height: 5.8mm !important;
  overflow: hidden !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.analysis-table tbody tr.analysis-row-grand td {
  height: 7.2mm !important;
  min-height: 7.2mm !important;
  max-height: 7.2mm !important;
  overflow: hidden !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}
.analysis-row-item td.analysis-col-product .analysis-product-name {
  white-space: normal;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.14;
}
.analysis-row-item td.analysis-col-notes {
  white-space: normal;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.14;
  font-size: 0.92em;
  font-weight: 500;
  font-style: italic;
  color: #64748b;
}
.analysis-row-item td.analysis-col-unit {
  white-space: normal;
  word-break: break-word;
  line-height: 1.12;
  font-size: 0.95em;
  font-weight: 700;
  color: #334155;
  text-transform: uppercase;
}
.analysis-row-item td.analysis-col-qty {
  font-size: 1em;
  font-weight: 900;
  color: #334155;
}
.analysis-row-item td.analysis-col-meta {
  font-size: 0.95em;
  font-weight: 600;
  color: #475569;
}
.analysis-row-item td .analysis-vendor-price-grid {
  max-height: 6.8mm;
  overflow: hidden;
  row-gap: 0 !important;
  column-gap: 2px !important;
}
.analysis-vendor-note {
  margin-top: 2px;
  padding-top: 2px;
  border-top: 1px dashed #e2e8f0;
  font-size: 0.72em;
  font-weight: 600;
  font-style: italic;
  color: #475569;
  line-height: 1.25;
  text-align: left;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.analysis-table tbody tr.analysis-row-item-notes td {
  height: auto !important;
  min-height: 7.1mm !important;
  max-height: none !important;
  overflow: visible !important;
  vertical-align: top;
  padding-top: 2px !important;
  padding-bottom: 2px !important;
}
.analysis-table tbody tr.analysis-row-item-notes .analysis-vendor-price-grid {
  max-height: none;
  overflow: visible;
}
/* Genişlikler thead’deki inline % ile verilir; burada yalnızca alt sınır */
.col-index { min-width: 12px; }
.col-product { width: 13%; }
.col-qty { width: 30px; }
.col-report-sn { min-width: 22px; }
.col-report-stock { min-width: 30px; }
.col-report-name { min-width: 0; }
.col-report-notes { min-width: 0; }
.col-report-ton { min-width: 26px; }
.col-report-qty { min-width: 28px; }
.col-report-unit { min-width: 44px; }
/* Karar yok: satırdaki en avantajlı (en düşük N.T.) hücreler */
.vendor-best-advantage { background-color: #fef3c7 !important; }
.vendor-pick-yes { background-color: rgba(22, 163, 74, 0.2) !important; }
.vendor-pick-no { background-color: rgba(239, 68, 68, 0.14) !important; }
@media print {
  /*
   * Önizleme: height:auto ile kutu içerik kadar. Yazdır/PDF: avoid + kısa blok bazen Blink’te
   * tam sayfa “yer ayırıp” altta boş bırakıyordu — break-inside kaldırıldı; yükseklik auto.
   * Sayfa bölme zaten JS ile satır bazlı.
   */
  html, body {
    height: auto !important;
    min-height: 0 !important;
  }
  .analysis-wrapper {
    width: 289mm !important;
    max-width: 100% !important;
    margin: 0 auto !important;
    padding: 0 !important;
    height: auto !important;
  }
  .a4-page {
    display: block !important;
    flex-direction: unset !important;
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    margin: 0 auto !important;
    margin-bottom: 0 !important;
    padding: 3mm 4mm !important;
    width: 289mm !important;
    max-width: 100% !important;
    min-height: 0 !important;
    max-height: none !important;
    height: auto !important;
    background: white !important;
    overflow: visible !important;
    page-break-inside: auto !important;
    break-inside: auto !important;
  }
  .a4-page:not(:last-child) {
    page-break-after: always !important;
  }
  .analysis-table { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; }
  .analysis-table th, .analysis-table td { border: 1px solid #333 !important; color: black !important; }
  /* Taban tablo punto + td inherit: özel sütun (açıklama/birim) em değerleri bozulmasın */
  .size-normal .analysis-table { font-size: 7.5px !important; }
  .size-normal .analysis-table th { font-size: 7.5px !important; }
  .size-normal .analysis-table td { font-size: inherit !important; }
  .size-small .analysis-table { font-size: 7px !important; }
  .size-small .analysis-table th { font-size: 7px !important; }
  .size-small .analysis-table td { font-size: inherit !important; }
  .size-xsmall .analysis-table { font-size: 6.5px !important; }
  .size-xsmall .analysis-table th { font-size: 6px !important; }
  .size-xsmall .analysis-table td { font-size: inherit !important; }
  .size-normal .analysis-table th.vendor-col-header { font-size: 6.75px !important; }
  .size-small .analysis-table th.vendor-col-header { font-size: 6.25px !important; }
  .size-xsmall .analysis-table th.vendor-col-header { font-size: 5.75px !important; }
  /*
   * Mantıksal sayfa (.a4-page) tek PDF sayfasından uzun olabiliyor; tarayıcı tabloyu
   * iki fiziksel sayfaya bölerken <tr> yarım kesilmesin diye satır atomik.
   */
  .analysis-table thead {
    display: table-header-group !important;
  }
  .analysis-table tbody tr {
    page-break-inside: avoid !important;
    break-inside: avoid !important;
  }
  .analysis-table thead tr.analysis-thead-row th {
    height: auto !important;
    min-height: 14px !important;
    max-height: none !important;
    overflow: visible !important;
  }
  .analysis-table tbody tr.analysis-row-group td {
    height: 5.8mm !important;
    min-height: 5.8mm !important;
    max-height: 5.8mm !important;
  }
  .analysis-table tbody tr.analysis-row-item td {
    height: 7.1mm !important;
    min-height: 7.1mm !important;
    max-height: 7.1mm !important;
  }
  .analysis-table tbody tr.analysis-row-item-notes td {
    height: auto !important;
    min-height: 7.1mm !important;
    max-height: none !important;
    overflow: visible !important;
    vertical-align: top !important;
    padding-top: 2px !important;
    padding-bottom: 2px !important;
  }
  .analysis-vendor-note {
    margin-top: 2px;
    padding-top: 2px;
    border-top: 1px dashed #cbd5e1;
    font-size: 0.72em;
    font-weight: 600;
    font-style: italic;
    color: #334155;
    line-height: 1.25;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .analysis-table tbody tr.analysis-row-subtotal td {
    height: 5.8mm !important;
    min-height: 5.8mm !important;
    max-height: 5.8mm !important;
  }
  .analysis-table tbody tr.analysis-row-grand td {
    height: 7.2mm !important;
    min-height: 7.2mm !important;
    max-height: 7.2mm !important;
  }
}
`;

/** Ana uygulama içinde Ctrl+P ile yazdırılırsa dashboard kromunu gizler (yeni sekme akışına ek). */
const ANALYSIS_PAGE_PRINT_CHROME_HIDE = `
@media print {
  aside, header, nav, .print-hidden,
  [data-slot="dialog-overlay"], [data-slot="dialog-portal"] {
    display: none !important;
  }
  html, body, #__next, main, [data-nextjs-scroll-focus-boundary] {
    background: #ffffff !important;
  }
  .analysis-report-root {
    padding: 0 !important;
    margin: 0 !important;
    overflow: visible !important;
    height: auto !important;
  }
  div[class*="overflow-hidden"], main[class*="overflow-y-auto"], .flex-1 {
    overflow: visible !important;
    height: auto !important;
    display: block !important;
    position: static !important;
  }
  .analysis-wrapper { position: static !important; }
}
`;

function analysisReportThClass(key: AnalysisReportColumnKey): string {
  switch (key) {
    case 'serialNumber':
      return 'col-report-sn';
    case 'stockCode':
      return 'col-report-stock';
    case 'productName':
      return 'col-report-name';
    case 'notes':
      return 'col-report-notes';
    case 'tonnage':
      return 'col-report-ton';
    case 'quantity':
      return 'col-report-qty';
    case 'unit':
      return 'col-report-unit';
    default:
      return '';
  }
}

/** Yatay A4 tabloda veri / tedarikçi dengesi: thead genişlikleri tüm satırlara yayılır (table-layout: fixed). */
const REPORT_COL_BASE_PCT: Record<AnalysisReportColumnKey, number> = {
  serialNumber: 4,
  stockCode: 5.5,
  productName: 22,
  notes: 17,
  tonnage: 5,
  quantity: 4.5,
  unit: 8.5,
};

const REPORT_INDEX_BASE_PCT = 2.3;
const REPORT_MIN_DATA_COLS_SUM_PCT = 54;
const REPORT_VENDOR_COL_MAX_PCT_EACH = 26;

function computeReportTableColumnPercents(
  orderedCols: AnalysisReportColumnKey[],
  vendorCount: number
): { indexPct: number; colPct: Partial<Record<AnalysisReportColumnKey, number>>; vendorEachPct: number } {
  const nv = Math.max(1, vendorCount);
  const rawSum = orderedCols.reduce((s, k) => s + REPORT_COL_BASE_PCT[k], 0);
  const dataTarget = Math.max(REPORT_MIN_DATA_COLS_SUM_PCT, rawSum);
  const scale = rawSum > 0 ? dataTarget / rawSum : 1;
  const colPct: Partial<Record<AnalysisReportColumnKey, number>> = {};
  for (const k of orderedCols) {
    colPct[k] = REPORT_COL_BASE_PCT[k] * scale;
  }
  const dataSum = orderedCols.reduce((s, k) => s + (colPct[k] ?? 0), 0);
  let vendorEach = (100 - REPORT_INDEX_BASE_PCT - dataSum) / nv;
  if (vendorEach > REPORT_VENDOR_COL_MAX_PCT_EACH) {
    vendorEach = REPORT_VENDOR_COL_MAX_PCT_EACH;
    const targetData = 100 - REPORT_INDEX_BASE_PCT - vendorEach * nv;
    const bump = targetData - dataSum;
    if (bump > 0) {
      if (orderedCols.includes('productName')) {
        colPct.productName = (colPct.productName ?? 0) + bump;
      } else if (orderedCols.includes('notes')) {
        colPct.notes = (colPct.notes ?? 0) + bump;
      } else {
        const pick = orderedCols[0];
        if (pick) colPct[pick] = (colPct[pick] ?? 0) + bump;
      }
    }
  }
  return { indexPct: REPORT_INDEX_BASE_PCT, colPct, vendorEachPct: vendorEach };
}

interface VendorInfo {
  id: string;
  name: string;
  isMarket?: boolean;
  marketUrl?: string | null;
}

interface QuoteInfo {
  id: string;
  price: number;
  currency: string;
  notes?: string;
  discountRate?: number;
  vatRate?: number | null;
  vendorId: string;
  vendor: { name: string };
  isMarket?: boolean;
  marketUrl?: string | null;
}

interface ItemInfo {
  id: string;
  productName: string;
  notes?: string;
  category?: string;
  quantity: number;
  unit: string;
  serialNumber?: string | null;
  stockCode?: string | null;
  tonnageInfo?: string | null;
  secondaryQuantity?: number;
  secondaryUnit?: string;
  sortOrder?: number | null;
  createdAt?: string;
  quotes?: QuoteInfo[];
}

function AnalysisContent() {
  const params = useParams();
  const id =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0] ?? ''
        : '';

  const router = useRouter();
  const searchParams = useSearchParams();

  const queryCurrency = searchParams.get('cur') || 'TRY';
  const debugPagination = searchParams.get('debugPagination') === '1';
  const [targetCurrency, setTargetCurrency] = useState(queryCurrency);
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [isRatesLoading, setIsRatesLoading] = useState(true);

  // Grouping State
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [itemGroups, setItemGroups] = useState<Record<string, string>>({});
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isExcelExporting, setIsExcelExporting] = useState(false);
  const [printTitle, setPrintTitle] = useState('');
  const analysisPrintRef = useRef<HTMLDivElement>(null);

  const [reportSettings, setReportSettings] = useState({
    ...DEFAULT_ANALYSIS_REPORT_VIEW_SETTINGS,
  });

  const [reportColumnVisibility, setReportColumnVisibility] = useState<AnalysisReportColumnVisibility>(
    () => ({ ...DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY })
  );

  useEffect(() => {
    if (!id) return;
    setReportColumnVisibility(loadAnalysisReportColumnVisibility(id));
    setReportSettings(loadAnalysisReportViewSettings(id));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    saveAnalysisReportColumnVisibility(id, reportColumnVisibility);
  }, [id, reportColumnVisibility]);

  useEffect(() => {
    if (!id) return;
    saveAnalysisReportViewSettings(id, reportSettings);
  }, [id, reportSettings]);

  const orderedReportColumns = useMemo(
    () => orderedVisibleReportColumns(reportColumnVisibility),
    [reportColumnVisibility]
  );

  const reportFixedColCount = useMemo(
    () => analysisReportFixedColumnCount(reportColumnVisibility),
    [reportColumnVisibility]
  );

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const newId = crypto.randomUUID();
    setGroups([...groups, { id: newId, name: newGroupName.trim() }]);
    setNewGroupName('');
    setActiveGroupId(newId);
  };

  /**
   * Yeni sekmede yalnızca raporu yazdırır.
   * Önemli: window.open() tıklama ile aynı senkron çağrı zincirinde olmalı; setTimeout veya noopener
   * genelde Chrome’da null döndürür / popup’ı engeller.
   */
  const beginReportPrintInNewTab = useCallback(() => {
    const w = window.open('about:blank', '_blank');
    if (!w) {
      window.alert(
        'Yeni sekme açılamadı. "noopener" kullanılmıyor; sorun devam ederse bu sayfada Ctrl+P ile yazdırın veya farklı tarayıcı deneyin.'
      );
      return;
    }
    const node = analysisPrintRef.current;
    if (!node) {
      w.close();
      return;
    }
    setIsPrintModalOpen(false);

    const origin = window.location.origin;
    const clone = node.cloneNode(true) as HTMLElement;
    const docHtml = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><base href="${origin}/"/><title>Teklif Analiz Raporu</title><style>${ANALYSIS_REPORT_STANDALONE_CSS}</style></head><body>${clone.outerHTML}</body></html>`;
    w.document.open();
    w.document.write(docHtml);
    w.document.close();

    try {
      w.opener = null;
    } catch {
      /* ignore */
    }

    const runPrint = () => {
      try {
        w.focus();
        w.print();
      } catch {
        /* ignore */
      }
    };
    setTimeout(runPrint, 150);
  }, []);

  const handleOpenPrintDialog = () => {
    beginReportPrintInNewTab();
  };

  const handleRemoveGroup = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setGroups(groups.filter((g) => g.id !== id));
    if (activeGroupId === id) setActiveGroupId(null);
    const nextItemGroups = { ...itemGroups };
    for (const itemId in nextItemGroups) {
      if (nextItemGroups[itemId] === id) delete nextItemGroups[itemId];
    }
    setItemGroups(nextItemGroups);
  };

  const toggleItemInGroup = (itemId: string) => {
    if (!activeGroupId) return;
    const nextItemGroups = { ...itemGroups };
    if (nextItemGroups[itemId] === activeGroupId) {
      delete nextItemGroups[itemId];
    } else {
      nextItemGroups[itemId] = activeGroupId;
    }
    setItemGroups(nextItemGroups);
  };

  const { data: req, isLoading } = useQuery({
    queryKey: ['procurement', id],
    queryFn: async () => {
      const { data } = await procurementApi.getById(id);
      return data;
    },
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (req?.title) document.title = pageTitle('Teklif analizi', req.title);
  }, [req?.title]);

  const showProductionMeta = showsProductionItemMeta((req as { moduleId?: string } | undefined)?.moduleId);
  const gatedReportColumns = useMemo(() => {
    if (showProductionMeta) return orderedReportColumns;
    return orderedReportColumns.filter((k) => k !== 'serialNumber' && k !== 'stockCode' && k !== 'tonnage');
  }, [orderedReportColumns, showProductionMeta]);
  const gatedColumnVisibility = useMemo(
    () =>
      showProductionMeta
        ? reportColumnVisibility
        : { ...reportColumnVisibility, serialNumber: false, stockCode: false, tonnage: false },
    [reportColumnVisibility, showProductionMeta]
  );
  const gatedFixedColCount = 1 + gatedReportColumns.length;

  const user = useAuthStore((s) => s.user);
  const canAccessAnalysis =
    user?.role === 'ADMIN' ||
    Boolean(user?.isExecutive) ||
    (user?.role === 'PURCHASING' && usesExecutiveDecisionInvite(user?.moduleId));
  useEffect(() => {
    if (user && !canAccessAnalysis) router.replace('/dashboard');
  }, [user, canAccessAnalysis, router]);
  const canAdminDecisions = user?.role === 'ADMIN';
  const [decisionOpen, setDecisionOpen] = useState(false);

  const initialDecisionChoices = useMemo(() => {
    const o: Record<string, string | null> = {};
    const picks = (req as { itemVendorPicks?: { itemId: string; chosenVendorId: string | null }[] } | undefined)
      ?.itemVendorPicks;
    if (!picks) return o;
    for (const p of picks) {
      o[p.itemId] = p.chosenVendorId;
    }
    return o;
  }, [req]);

  useEffect(() => {
    if (searchParams.get('decision') === '1' && id && user?.role === 'ADMIN') {
      setDecisionOpen(true);
      router.replace(`/procurement/${id}/analysis`, { scroll: false });
    }
  }, [searchParams, id, router, user?.role]);

  const orderedItems = useMemo(
    () => sortRequestItems<ItemInfo>(req?.items ?? []),
    [req?.items]
  );

  useEffect(() => {
    const fetchRates = async () => {
      setIsRatesLoading(true);
      try {
        const frozen =
          req?.status === 'COMPLETED' &&
          req?.fxRatesJson &&
          typeof req.fxRatesJson === 'object'
            ? (req.fxRatesJson as Record<string, number>)
            : null;
        if (frozen && Number(frozen.USD) > 0 && Number(frozen.EUR) > 0) {
          setRates({
            TRY: 1,
            USD: Number(frozen.USD),
            EUR: Number(frozen.EUR),
            CHF: Number(frozen.CHF) > 0 ? Number(frozen.CHF) : FALLBACK_RATES.CHF,
          });
          return;
        }
        const { data } = await currencyApi.getRates();
        if (data.success && data.rates) {
          setRates(data.rates);
        }
      } catch {
        /* fallback state kalır */
      } finally {
        setIsRatesLoading(false);
      }
    };
    if (!req) return;
    fetchRates();
  }, [req]);

  // Kategoriye göre otomatik gruplama
  useEffect(() => {
    if (orderedItems.length > 0 && groups.length === 0) {
      const uniqueCategories = Array.from(
        new Set(orderedItems.map((i: ItemInfo) => i.category).filter(Boolean))
      );

      if (uniqueCategories.length > 0) {
        const newGroups = uniqueCategories.map((cat) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: cat as string,
        }));

        const newItemGroups: Record<string, string> = {};
        orderedItems.forEach((item: ItemInfo) => {
          if (item.category) {
            const group = newGroups.find((g) => g.name === item.category);
            if (group) newItemGroups[item.id] = group.id;
          }
        });

        setGroups(newGroups);
        setItemGroups(newItemGroups);
      }
    }
  }, [orderedItems, groups.length]);

  const convertPrice = (price: number, from: string, to: string, vendorId?: string) => {
    if (from === to) return price;
    const assignment = vendorId
      ? req.assignments?.find((a: { vendorId: string }) => a.vendorId === vendorId)
      : null;
    const r = ratesWithVendorUsd(rates, assignment);
    const priceInTry = from === 'TRY' ? price : price * (r[from] || 1);
    return to === 'TRY' ? priceInTry : priceInTry / (r[to] || 1);
  };

  const vendorList: VendorInfo[] = useMemo(() => {
    if (!orderedItems.length) return [];
    const map = new Map<string, VendorInfo>();
    orderedItems.forEach((item: ItemInfo) => {
      item.quotes?.forEach((q: QuoteInfo) => {
        if (!map.has(q.vendorId)) {
          map.set(q.vendorId, {
            id: q.vendorId,
            name: q.vendor.name,
            isMarket: Boolean(q.isMarket),
            marketUrl: q.marketUrl || null,
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => compareVendorNames(a.name, b.name));
  }, [orderedItems]);

  const reportTableWidths = useMemo(
    () => computeReportTableColumnPercents(gatedReportColumns, vendorList.length),
    [gatedReportColumns, vendorList.length]
  );

  const showGroupSubtotals = reportSettings.showGroupTotals;

  const handleExcelExport = useCallback(async () => {
    if (!req?.items) return;
    setIsExcelExporting(true);
    try {
      const { buildAnalysisExportRows, downloadAnalysisExcel } = await import(
        /* webpackChunkName: "analysis-excel-export" */ '@/lib/analysis-excel-export'
      );
      const exportRows = buildAnalysisExportRows({
        items: orderedItems,
        groups,
        itemGroups,
        showGroupSubtotals: reportSettings.showGroupTotals,
      });
      const excelPayload: DownloadAnalysisExcelParams = {
        reportTitle: req.title,
        subtitle: printTitle.trim() || undefined,
        requestId: id,
        exportRows,
        vendorList,
        targetCurrency,
        rates,
        showPrices: reportSettings.showPrices,
        showVendorNotes: reportSettings.showVendorNotes,
        assignments: req.assignments,
        applyVat: usesPurchasingQuoteForm(req.moduleId),
        columnVisibility: gatedColumnVisibility,
      };
      await downloadAnalysisExcel(excelPayload);
    } catch (e) {
      console.error(e);
      window.alert('Excel dosyası oluşturulamadı.');
    } finally {
      setIsExcelExporting(false);
    }
  }, [
    req,
    orderedItems,
    groups,
    itemGroups,
    reportSettings.showGroupTotals,
    reportSettings.showPrices,
    reportSettings.showVendorNotes,
    vendorList,
    targetCurrency,
    rates,
    printTitle,
    id,
    gatedColumnVisibility,
  ]);

  type Row =
    | { type: 'group-header'; groupName: string; id: string }
    | { type: 'item'; item: ItemInfo; globalIndex: number }
    | { type: 'group-footer'; groupName: string; id: string; items: ItemInfo[] }
    | { type: 'grand-total'; id: string; items: ItemInfo[] };

  const describePaginationRow = (row: Row) =>
    row.type === 'group-header'
      ? `group-header "${row.groupName}"`
      : row.type === 'item'
        ? `item #${row.globalIndex} (${row.item.productName?.slice(0, 48) || '?'})`
        : row.type === 'group-footer'
          ? `group-footer "${row.groupName}"`
          : 'grand-total';

  /**
   * Heuristic: thead + rapor başlığı her sayfada sabit; limit düşükse sayfa ortasında kesilir,
   * PDF’te alt yarı boş kalır. Rezerv (son kalemde footer için) çok büyükse de erken kesilir.
   */
  const PAGE_WEIGHT_LIMIT = 25.5;
  const GROUP_HEADER_WEIGHT = 0.68;
  const GROUP_FOOTER_WEIGHT = 0.52;
  const GRAND_TOTAL_WEIGHT = 0.82;
  /** Son kalemden önce footer için ayrılan rezerv (tam footer ağırlığından düşük = daha fazla satır sığar) */
  const GROUP_FOOTER_RESERVE = 0.42;
  /**
   * Sarı bölüm başlığı tam limitte sayfaya sığar sanılıp eklenir; ilk kalem bir alt satırda sığmayınca
   * sonraki sayfaya gider → başlık sayfa sonunda yetim kalır. Başlık satırı için kırılım eşiğini düşürürüz.
   */
  const SECTION_HEADER_BREAK_GUARD = 1.45;

  const pages: Row[][] = useMemo(() => {
    if (!orderedItems.length) return [];

    const vendorColCount = vendorList.length || 1;
    const getItemRowWeight = (item?: ItemInfo) => {
      let w = 0.4;
      if (vendorColCount > 6) w = 0.52;
      else if (vendorColCount > 4) w = 0.43;
      if (reportSettings.showVendorNotes && item?.quotes?.some((q) => String(q.notes || '').trim())) {
        const longest = Math.max(
          0,
          ...(item.quotes || []).map((q) => String(q.notes || '').trim().length),
        );
        w += 0.38 + Math.min(1.05, longest / 80);
      }
      return w;
    };
    const ITEM_ROW_WEIGHT = getItemRowWeight();

    const pageBreakLimit = (row: Row) =>
      row.type === 'group-header' ? PAGE_WEIGHT_LIMIT - SECTION_HEADER_BREAK_GUARD : PAGE_WEIGHT_LIMIT;

    const getRowWeight = (row: Row) =>
      row.type === 'item'
        ? getItemRowWeight(row.item)
        : row.type === 'group-header'
          ? GROUP_HEADER_WEIGHT
          : row.type === 'group-footer'
            ? GROUP_FOOTER_WEIGHT
            : GRAND_TOTAL_WEIGHT;

    if (groups.length === 0) {
      const autoGroups = orderedItems.reduce(
        (acc: Record<string, ItemInfo[]>, item: ItemInfo) => {
          const groupName = item.category?.trim() || 'Diğer Ürünler';
          if (!acc[groupName]) acc[groupName] = [];
          acc[groupName].push(item);
          return acc;
        },
        {}
      );
      const autoGroupEntries = Object.entries(autoGroups) as Array<[string, ItemInfo[]]>;
      const hasAutoGrouping =
        autoGroupEntries.length > 1 ||
        (autoGroupEntries.length === 1 && autoGroupEntries[0][0] !== 'Diğer Ürünler');

      // Grup state'i boş olsa bile kategori varsa ara toplamları gösterebilmek için otomatik fallback
      if (hasAutoGrouping) {
        const printPages: Row[][] = [];
        let currentPage: Row[] = [];
        let currentWeight = 0;
        let itemsProcessedCount = 0;

        const pushRow = (row: Row, headerRow?: Row, reserveNextWeight = 0) => {
          const weight = getRowWeight(row);
          const limit = pageBreakLimit(row);
          if (currentWeight + weight + reserveNextWeight > limit && currentWeight > 0) {
            let movedSectionHeader: Row | null = null;
            if (row.type === 'item' || row.type === 'group-footer') {
              const last = currentPage[currentPage.length - 1];
              if (last?.type === 'group-header') {
                currentPage.pop();
                currentWeight -= GROUP_HEADER_WEIGHT;
                movedSectionHeader = last;
              }
            }
            const willContinuation =
              !movedSectionHeader &&
              headerRow &&
              (row.type === 'item' || row.type === 'group-footer') &&
              headerRow.type === 'group-header';
            const strategy = movedSectionHeader
              ? 'orphan-header-rewrite'
              : willContinuation
                ? 'continuation-header'
                : 'plain-break';
            if (debugPagination) {
              console.log('[analysis-pagination]', {
                branch: 'auto-groups',
                strategy,
                incoming: describePaginationRow(row),
                weight,
                reserveNextWeight,
                limit,
                weightBeforeFlush: currentWeight,
                totalIfAdded: currentWeight + weight + reserveNextWeight,
              });
            }
            if (currentPage.length > 0) printPages.push(currentPage);
            currentPage = [];
            currentWeight = 0;
            if (movedSectionHeader) {
              currentPage.push(movedSectionHeader);
              currentWeight += GROUP_HEADER_WEIGHT;
            } else if (
              headerRow &&
              (row.type === 'item' || row.type === 'group-footer') &&
              headerRow.type === 'group-header'
            ) {
              currentPage.push({
                type: 'group-header',
                id: `${headerRow.id}-cont`,
                groupName: `${headerRow.groupName} (Devamı)`,
              });
              currentWeight += GROUP_HEADER_WEIGHT;
            }
          }
          currentPage.push(row);
          currentWeight += weight;
        };

        autoGroupEntries.forEach(([groupName, groupItems], idx) => {
          const headerRow: Row = {
            type: 'group-header',
            groupName,
            id: `auto-header-${idx}`,
          };
          pushRow(headerRow, undefined, ITEM_ROW_WEIGHT);
          groupItems.forEach((item, itemIdx) => {
            itemsProcessedCount++;
            const isLastItem = itemIdx === groupItems.length - 1;
            const reserve = isLastItem && showGroupSubtotals ? GROUP_FOOTER_RESERVE : 0;
            pushRow({ type: 'item', item, globalIndex: itemsProcessedCount }, headerRow, reserve);
          });
          if (showGroupSubtotals) {
            pushRow(
              { type: 'group-footer', groupName, id: `auto-footer-${idx}`, items: groupItems },
              headerRow
            );
          }
        });

        pushRow({ type: 'grand-total', id: 'grand-total', items: orderedItems });
        if (currentPage.length > 0) printPages.push(currentPage);
        if (debugPagination) {
          console.groupCollapsed(
            `[analysis-pagination] özet: otomatik kategori (${printPages.length} sayfa)`
          );
          printPages.forEach((p, i) => {
            const w = p.reduce((s, r) => s + getRowWeight(r), 0);
            console.log(`Sayfa ${i + 1}`, { approxWeight: w.toFixed(2), rows: p.map(describePaginationRow) });
          });
          console.groupEnd();
        }
        return printPages;
      }

      const printPages: Row[][] = [];
      let currentPage: Row[] = [];
      let currentWeight = 0;
      let itemsProcessedCount = 0;

        const pushRow = (row: Row, reserveNextWeight = 0) => {
        // Compact print layout weights
          const weight = getRowWeight(row);
          const limit = pageBreakLimit(row);
          if (currentWeight + weight + reserveNextWeight > limit && currentWeight > 0) {
          if (debugPagination) {
            console.log('[analysis-pagination]', {
              branch: 'flat-list',
              strategy: 'plain-break',
              incoming: describePaginationRow(row),
              weight,
              reserveNextWeight,
              limit,
              weightBeforeFlush: currentWeight,
              totalIfAdded: currentWeight + weight + reserveNextWeight,
            });
          }
          printPages.push(currentPage);
          currentPage = [];
          currentWeight = 0;
        }
        currentPage.push(row);
        currentWeight += weight;
      };

      orderedItems.forEach((item: ItemInfo, idx: number) => {
        itemsProcessedCount++;
        const isLastItem = idx === orderedItems.length - 1;
        const reserve = isLastItem && showGroupSubtotals ? GROUP_FOOTER_RESERVE : 0;
        pushRow({ type: 'item', item, globalIndex: itemsProcessedCount }, reserve);
      });
      if (showGroupSubtotals) {
        pushRow({
          type: 'group-footer',
          groupName: 'Diğer Ürünler',
          id: 'footer-ungrouped-default',
          items: orderedItems,
        });
      }
      // Push grand total if no groups exist
      pushRow({ type: 'grand-total', id: 'grand-total', items: orderedItems });

      if (currentPage.length > 0) printPages.push(currentPage);
      if (debugPagination) {
        console.groupCollapsed(`[analysis-pagination] özet: düz liste (${printPages.length} sayfa)`);
        printPages.forEach((p, i) => {
          const w = p.reduce((s, r) => s + getRowWeight(r), 0);
          console.log(`Sayfa ${i + 1}`, { approxWeight: w.toFixed(2), rows: p.map(describePaginationRow) });
        });
        console.groupEnd();
      }
      return printPages;
    }

    const printPages: Row[][] = [];
    let currentPage: Row[] = [];
    let currentWeight = 0;

    let itemsProcessedCount = 0;

    const pushRow = (row: Row, headerRow?: Row, reserveNextWeight = 0) => {
      // Compact print layout weights
      const weight = getRowWeight(row);
      const limit = pageBreakLimit(row);
      if (currentWeight + weight + reserveNextWeight > limit && currentWeight > 0) {
        let movedSectionHeader: Row | null = null;
        if (row.type === 'item' || row.type === 'group-footer') {
          const last = currentPage[currentPage.length - 1];
          if (last?.type === 'group-header') {
            currentPage.pop();
            currentWeight -= GROUP_HEADER_WEIGHT;
            movedSectionHeader = last;
          }
        }
        const willContinuation =
          !movedSectionHeader &&
          headerRow &&
          (row.type === 'item' || row.type === 'group-footer') &&
          headerRow.type === 'group-header';
        const strategy = movedSectionHeader
          ? 'orphan-header-rewrite'
          : willContinuation
            ? 'continuation-header'
            : 'plain-break';
        if (debugPagination) {
          console.log('[analysis-pagination]', {
            branch: 'manual-groups',
            strategy,
            incoming: describePaginationRow(row),
            weight,
            reserveNextWeight,
            limit,
            weightBeforeFlush: currentWeight,
            totalIfAdded: currentWeight + weight + reserveNextWeight,
          });
        }
        if (currentPage.length > 0) printPages.push(currentPage);
        currentPage = [];
        currentWeight = 0;
        if (movedSectionHeader) {
          currentPage.push(movedSectionHeader);
          currentWeight += GROUP_HEADER_WEIGHT;
        } else if (
          headerRow &&
          (row.type === 'item' || row.type === 'group-footer') &&
          headerRow.type === 'group-header'
        ) {
          currentPage.push({
            type: 'group-header',
            id: `${headerRow.id}-cont`,
            groupName: `${headerRow.groupName} (Devamı)`,
          });
          currentWeight += GROUP_HEADER_WEIGHT;
        }
      }
      currentPage.push(row);
      currentWeight += weight;
    };

    const groupedItemIds = new Set<string>();

    groups.forEach((g) => {
      const groupItems = orderedItems.filter((i: ItemInfo) => itemGroups[i.id] === g.id);
      if (groupItems.length === 0) return;

      const headerRow: Row = { type: 'group-header', groupName: g.name, id: `header-${g.id}` };
      pushRow(headerRow, undefined, ITEM_ROW_WEIGHT);

      groupItems.forEach((item: ItemInfo, itemIdx: number) => {
        groupedItemIds.add(item.id);
        itemsProcessedCount++;
        const isLastItem = itemIdx === groupItems.length - 1;
        const reserve = isLastItem && showGroupSubtotals ? GROUP_FOOTER_RESERVE : 0;
        pushRow({ type: 'item', item, globalIndex: itemsProcessedCount }, headerRow, reserve);
      });

      // Push group footer subtotal
      if (showGroupSubtotals) {
        pushRow({ type: 'group-footer', groupName: g.name, id: `footer-${g.id}`, items: groupItems }, headerRow);
      }
    });

    const ungroupedItems = orderedItems.filter((i: ItemInfo) => !groupedItemIds.has(i.id));
    if (ungroupedItems.length > 0) {
      const headerRow: Row = { type: 'group-header', groupName: 'Diğer Ürünler', id: 'header-ungrouped' };
      pushRow(headerRow, undefined, ITEM_ROW_WEIGHT);
      ungroupedItems.forEach((item: ItemInfo, itemIdx: number) => {
        itemsProcessedCount++;
        const isLastItem = itemIdx === ungroupedItems.length - 1;
        const reserve = isLastItem && showGroupSubtotals ? GROUP_FOOTER_RESERVE : 0;
        pushRow({ type: 'item', item, globalIndex: itemsProcessedCount }, headerRow, reserve);
      });
      if (showGroupSubtotals) {
        pushRow({ type: 'group-footer', groupName: 'Diğer Ürünler', id: `footer-ungrouped`, items: ungroupedItems }, headerRow);
      }
    }

    // Push grand total at the very end
    pushRow({ type: 'grand-total', id: 'grand-total', items: orderedItems });

    if (currentPage.length > 0) {
      printPages.push(currentPage);
    }
    if (debugPagination) {
      console.groupCollapsed(
        `[analysis-pagination] özet: manuel gruplar (${printPages.length} sayfa)`
      );
      printPages.forEach((p, i) => {
        const w = p.reduce((s, r) => s + getRowWeight(r), 0);
        console.log(`Sayfa ${i + 1}`, { approxWeight: w.toFixed(2), rows: p.map(describePaginationRow) });
      });
      console.groupEnd();
    }
    return printPages;
  }, [orderedItems, groups, itemGroups, showGroupSubtotals, vendorList.length, debugPagination, reportSettings.showVendorNotes]);

  const printablePages = useMemo(
    () =>
      pages
        .map((pageRows) =>
          pageRows.filter((row) => row.type !== 'group-footer' || showGroupSubtotals)
        )
        .filter((pageRows) =>
          pageRows.some(
            (row) =>
              row.type === 'item' ||
              row.type === 'grand-total' ||
              (row.type === 'group-footer' && showGroupSubtotals)
          )
        ),
    [pages, showGroupSubtotals]
  );

  if (!id || isLoading || isRatesLoading) return <DetailSkeleton />;

  if (!req)
    return <div className="p-10 text-center text-muted-foreground">Sipariş bulunamadı.</div>;

  const vendorCount = vendorList.length;
  const sizeClass =
    vendorCount <= 4 ? 'size-normal' : vendorCount <= 6 ? 'size-small' : 'size-xsmall';

  const getCurrencySymbol = (code: string) => currencySymbol(code);

  const formatMoney = (value: number, currency: string) => {
    const formatted = value.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return currency === 'TRY'
      ? `${formatted}${getCurrencySymbol(currency)}`
      : `${getCurrencySymbol(currency)}${formatted}`;
  };

  const getOverallDiscountRate = (vendorId: string) => {
    const assignment = req.assignments?.find(
      (a: { vendorId: string; overallDiscountRate?: number }) => a.vendorId === vendorId
    );
    return Number(assignment?.overallDiscountRate) || 0;
  };

  const getComparableRowNetTotal = (item: ItemInfo, quote: QuoteInfo) => {
    const net = quoteLineTotal({
      price: Number(quote.price) || 0,
      quantity: item.quantity,
      discountRate: Number(quote.discountRate) || 0,
      vatRate: quote.vatRate,
      overallDiscountRate: getOverallDiscountRate(quote.vendorId),
      applyVat: usesPurchasingQuoteForm(req?.moduleId),
    });
    return convertPrice(net, quote.currency, 'TRY', quote.vendorId);
  };

  const getBestVendorIdsForItem = (item: ItemInfo) => {
    if (!item.quotes || item.quotes.length === 0) return new Set<string>();

    let minValue = Number.POSITIVE_INFINITY;
    const perVendor: Array<{ vendorId: string; total: number }> = [];

    item.quotes.forEach((q) => {
      const total = getComparableRowNetTotal(item, q);
      perVendor.push({ vendorId: q.vendorId, total });
      if (total < minValue) minValue = total;
    });

    // Kuruş seviyesindeki farklar için küçük tolerans.
    const EPSILON = 0.01;
    return new Set(
      perVendor.filter((v) => Math.abs(v.total - minValue) <= EPSILON).map((v) => v.vendorId)
    );
  };

  return (
    <div className="analysis-report-root p-4 sm:p-6 w-full mx-auto h-full overflow-y-auto">
      <style
        dangerouslySetInnerHTML={{
          __html: `${ANALYSIS_REPORT_STANDALONE_CSS}\n${ANALYSIS_PAGE_PRINT_CHROME_HIDE}`,
        }}
      />

      <div className="print-hidden mx-auto mb-8 w-full max-w-[297mm] space-y-6">
        {/* Başlık kutusuz: solda geri, küçük üst satır, büyük ve ince talep adı; sağda eylemler. Kutu içinde kutu yok.
         * Ad ve eylemler yan yana sığmazsa eylemler alt satıra iner (ad hiçbir zaman düğmelerin altına girmez). */}
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-6 pt-2">
          <div className="min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => router.back()}
              className="group/back -ml-1.5 mb-5 inline-flex h-8 items-center gap-1.5 rounded-full pl-1.5 pr-3 text-[13px] text-white/50 outline-none transition-colors duration-150 hover:bg-brand hover:text-primary-foreground focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <ArrowLeft className="size-4 transition-transform duration-300 group-hover/back:-translate-x-0.5" />
              Geri
            </button>
            <p className="fx-rise text-[12.5px] font-medium text-white/45">Teklif analiz raporu</p>
            {/* "25081_EKİPMAN_FİYAT_TALEBİ" gibi tek parça ad satırdan uzunsa harf aralarından bölünür. */}
            <h1 className="mt-1.5 text-[28px] font-[300] leading-[1.1] tracking-[-0.03em] text-white sm:text-[36px] lg:text-[40px] [&_.fx-word]:max-w-full [&_.fx-word]:whitespace-normal!">
              <SmokeText text={req.title} />
            </h1>
          </div>

          <div className="fx-rise flex flex-wrap items-center gap-2">
            <SecondaryButton
              icon={<Settings className="size-4" strokeWidth={1.8} />}
              onClick={() => setIsGroupModalOpen(true)}
            >
              Rapor ayarları
              {groups.length > 0 ? <span className="tabular-nums opacity-60">{groups.length}</span> : null}
            </SecondaryButton>
            <SecondaryButton
              icon={
                isExcelExporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="size-4" strokeWidth={1.8} />
                )
              }
              disabled={isExcelExporting}
              onClick={handleExcelExport}
            >
              Excel indir
            </SecondaryButton>
            {canAdminDecisions ? (
              <SecondaryButton
                icon={<BadgeCheck className="size-4" strokeWidth={1.8} />}
                onClick={() => setDecisionOpen(true)}
              >
                Satın alma kararları
              </SecondaryButton>
            ) : null}
            <PrimaryButton
              icon={<Printer className="size-4" strokeWidth={1.8} />}
              onClick={() => setIsPrintModalOpen(true)}
            >
              Yazdır / PDF
            </PrimaryButton>
          </div>
        </header>

        <Dialog open={isPrintModalOpen} onOpenChange={setIsPrintModalOpen}>
          <DialogContent className="sm:max-w-[425px] bg-card border-border/50 text-foreground">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Printer className="w-5 h-5 text-primary" /> Rapor Başlığı Belirle
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Raporun üst kısmında görünecek özel bir başlık veya açıklama girebilirsiniz (isteğe bağlı).
                  Yazdırmada hedef olarak &quot;PDF olarak kaydet&quot; seçerek vektörel PDF alabilirsiniz.
                </p>
                <Input
                  id="printTitle"
                  placeholder="Örn: 2024 Yılı 2. Çeyrek Alım Analizi"
                  value={printTitle}
                  onChange={(e) => setPrintTitle(e.target.value)}
                  className="bg-background border-border/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleOpenPrintDialog();
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 flex-wrap">
              <DialogClose render={<Button variant="ghost" type="button">Vazgeç</Button>} />
              <Button
                type="button"
                onClick={handleOpenPrintDialog}
                className="bg-primary text-primary-foreground font-bold"
              >
                Yazdır veya PDF kaydet
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
          <DialogContent className="w-[95vw] max-w-3xl sm:max-w-3xl bg-card border-border/50 text-foreground p-4 sm:p-6 max-h-[88vh] overflow-y-auto">
            <DialogHeader className="border-b border-border/50 pb-4 mb-4">
              <DialogTitle className="text-xl font-bold flex items-center gap-3">
                <Settings className="w-5 h-5 text-primary" /> Rapor Ayarları & Gruplama
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 sm:space-y-6">
              {/* AYARLAR BÖLÜMÜ */}
              <div className="bg-background/50 border border-border/60 rounded-xl p-4 sm:p-5">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border/40 pb-2">Rapor Görünüm Ayarları</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border/50">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">Bölüm Toplamları</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Grupların ara toplamlarını gösterir</span>
                    </div>
                    <button
                      onClick={() => setReportSettings(s => ({...s, showGroupTotals: !s.showGroupTotals}))}
                      className={`w-11 h-6 rounded-full relative transition-colors border shadow-inner ${reportSettings.showGroupTotals ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
                    >
                      <div className={`absolute top-[1.5px] left-[1.5px] w-5 h-5 rounded-full bg-white transition-transform ${reportSettings.showGroupTotals ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border/50">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">Fiyatlar & Tutarlar</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Ürün fiyat ve iskontolarını gösterir</span>
                    </div>
                    <button
                      onClick={() => setReportSettings(s => ({...s, showPrices: !s.showPrices}))}
                      className={`w-11 h-6 rounded-full relative transition-colors border shadow-inner ${reportSettings.showPrices ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
                    >
                      <div className={`absolute top-[1.5px] left-[1.5px] w-5 h-5 rounded-full bg-white transition-transform ${reportSettings.showPrices ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-card p-3 rounded-lg border border-border/50">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">Tedarikçi notları</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Teklif satırındaki tedarikçi açıklamasını gösterir</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReportSettings(s => ({...s, showVendorNotes: !s.showVendorNotes}))}
                      className={`w-11 h-6 rounded-full relative transition-colors border shadow-inner ${reportSettings.showVendorNotes ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
                    >
                      <div className={`absolute top-[1.5px] left-[1.5px] w-5 h-5 rounded-full bg-white transition-transform ${reportSettings.showVendorNotes ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="mt-6 pt-6 border-t border-border/40">
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Tablo sütunları
                  </h4>
                  <p className="text-[11px] text-muted-foreground mb-4">
                    {showProductionMeta
                      ? 'SN, stok, ürün adı, açıklama, tonaj, miktar ve birim sütunlarını açıp kapatabilirsiniz. Önizleme, yazdır / PDF ve Excel çıktısı bu ayarla uyumludur.'
                      : 'Ürün adı, açıklama, miktar ve birim sütunlarını açıp kapatabilirsiniz. Önizleme, yazdır / PDF ve Excel çıktısı bu ayarla uyumludur.'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(showProductionMeta
                      ? ANALYSIS_REPORT_COLUMN_KEYS
                      : ANALYSIS_REPORT_COLUMN_KEYS.filter(
                          (k) => k !== 'serialNumber' && k !== 'stockCode' && k !== 'tonnage'
                        )
                    ).map((key) => (
                      <div
                        key={key}
                        className="flex items-center justify-between bg-card p-2.5 rounded-lg border border-border/50 gap-2"
                      >
                        <span className="text-xs font-bold text-foreground">{ANALYSIS_REPORT_COLUMN_LABELS[key]}</span>
                        <button
                          type="button"
                          aria-pressed={reportColumnVisibility[key]}
                          onClick={() =>
                            setReportColumnVisibility((s) => ({ ...s, [key]: !s[key] }))
                          }
                          className={`w-11 h-6 shrink-0 rounded-full relative transition-colors border shadow-inner ${reportColumnVisibility[key] ? 'bg-primary border-primary' : 'bg-muted border-border'}`}
                        >
                          <span
                            className={`absolute top-[1.5px] left-[1.5px] w-5 h-5 rounded-full bg-white transition-transform ${reportColumnVisibility[key] ? 'translate-x-5' : ''}`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BAZ PARA BIRIMI AYARI */}
                <div className="mt-6 pt-6 border-t border-border/40">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-foreground">Baz Para Birimi</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Raporun hesaplanacağı ana para birimi</span>
                    </div>
                    <div className="flex items-center gap-4 bg-background/50 p-2 rounded-xl border border-border/50">
                      <div className="flex gap-1.5">
                        {['TRY', 'USD', 'EUR', 'CHF'].map((c) => (
                          <button
                            key={c}
                            onClick={() => setTargetCurrency(c)}
                            className={`px-4 py-2 rounded-lg text-[11px] font-black transition-all ${targetCurrency === c ? 'bg-primary text-primary-foreground shadow-md scale-105' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground opacity-70'}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                      <div className="h-6 w-px bg-border/50 mx-1 hidden sm:block" />
                      <div className="flex gap-4 text-[11px] font-mono font-bold text-foreground/80 px-2 items-center flex-wrap">
                         <span className="flex items-center gap-1"><b className="text-primary">$</b>{rates.USD.toFixed(2)}</span>
                         <span className="flex items-center gap-1"><b className="text-primary">€</b>{rates.EUR.toFixed(2)}</span>
                         <span className="flex items-center gap-1"><b className="text-primary">CHF</b>{Number(rates.CHF || 0).toFixed(2)}</span>
                         {req?.status === 'COMPLETED' && req?.fxFrozenAt ? (
                           <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400/90">
                             Kilitli kur
                           </span>
                         ) : req?.status === 'COMPLETED' ? (
                           <span className="text-[10px] font-bold uppercase tracking-wide text-amber-400/90">
                             Kur kilitlenmemiş (eski)
                           </span>
                         ) : (
                           <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                             Canlı
                           </span>
                         )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            {/* GRUPLAMA BÖLÜMÜ */}
            <div className="bg-background/50 border border-border/60 rounded-xl p-4 sm:p-5 space-y-4">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-2 border-b border-border/40 pb-2">Ürün Gruplama Yöneticisi</h3>
              <div className="flex flex-col sm:flex-row gap-3 items-center">
              <Input
                placeholder="Örn: Ön Temizleme Grubu"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
                className="w-full flex-1 border-border/80 bg-background"
              />
              <Button onClick={handleCreateGroup} className="w-full sm:w-auto shrink-0 bg-primary font-bold text-primary-foreground">
                Yeni Grup Ekle
              </Button>
            </div>

            {groups.length > 0 && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border/30">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  İşlem Yapılacak Grubu Seçin:
                </span>
                <div className="flex flex-wrap gap-2">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setActiveGroupId(g.id)}
                      className={`flex items-center gap-2 border rounded-full pl-4 pr-2 py-1.5 transition-all text-sm font-bold ${activeGroupId === g.id ? 'bg-primary text-primary-foreground border-primary shadow-lg ring-2 ring-primary/20 scale-[1.02]' : 'bg-background/50 border-border/60 text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
                    >
                      <span>{g.name}</span>
                      <div
                        onClick={(e) => handleRemoveGroup(g.id, e)}
                        className={`p-1.5 rounded-full transition-colors ml-1 ${activeGroupId === g.id ? 'hover:bg-black/20 text-primary-foreground/80 hover:text-white' : 'hover:bg-red-500/10 text-red-500/70 hover:text-red-500'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={`max-h-[50vh] overflow-y-auto border rounded-xl divide-y divide-border/30 transition-all ${!activeGroupId ? 'opacity-50 pointer-events-none grayscale border-border/30' : 'border-primary/40 shadow-inner'}`}>
              <div className="bg-muted/30 p-3 text-xs font-bold text-muted-foreground text-center sticky top-0 z-10 backdrop-blur-md border-b border-border/30">
                {!activeGroupId 
                  ? 'Ürünleri seçebilmek için yukarıdan bir grup oluşturun veya aktif edin.'
                  : `Seçili Grup: ${groups.find(g => g.id === activeGroupId)?.name} — Ürünleri gruba eklemek için tıklayın`}
              </div>
              {req?.items?.map((item: ItemInfo) => {
                const isSelected = itemGroups[item.id] === activeGroupId;
                const assignedGroupId = itemGroups[item.id];
                const isAssignedToOther = assignedGroupId && assignedGroupId !== activeGroupId;
                if (isAssignedToOther) return null;

                return (
                  <div 
                    key={item.id} 
                    onClick={() => toggleItemInGroup(item.id)}
                    className={`flex justify-between items-center p-3 sm:px-4 cursor-pointer transition-colors gap-3 ${isSelected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-white/5'}`}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                      <div className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 bg-background'}`}>
                        {isSelected && <CheckCircle2 className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <p className={`text-sm font-bold truncate transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                          {item.productName}
                        </p>
                        <div className="flex flex-wrap gap-x-2 text-[9px] text-muted-foreground mt-0.5">
                          {showProductionMeta && item.serialNumber && <span>SN: {item.serialNumber}</span>}
                          {showProductionMeta && item.stockCode && <span>Stok: {item.stockCode}</span>}
                          {showProductionMeta && item.tonnageInfo && <span>Tonaj: {item.tonnageInfo}</span>}
                          <span>{item.quantity} {item.unit}</span>
                        </div>
                      </div>
                    </div>
                    {isAssignedToOther && (
                      <div className="shrink-0 text-[10px] font-bold text-muted-foreground bg-muted/40 px-2 py-1 rounded-md max-w-[120px] truncate border border-border/40">
                        {groups.find(g => g.id === assignedGroupId)?.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>

      <div className="analysis-sheet-viewport">
      <div ref={analysisPrintRef} className={`analysis-wrapper ${sizeClass}`}>
        {printablePages.map((pageItems, pageIdx) => {
          return (
            <div key={pageIdx} className="a4-page">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 2,
                  paddingBottom: 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-black.png" alt="Logo" style={{ height: 24 }} />
                  <div
                    style={{
                      width: 1,
                      height: 24,
                      background: '#334155',
                      opacity: 0.55,
                      margin: '0 2px',
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color: '#1e293b',
                        textTransform: 'uppercase',
                        letterSpacing: -0.4,
                      }}
                    >
                      Teklif Analiz Raporu
                    </div>
                    <div
                      style={{
                        fontSize: 7,
                        fontWeight: 800,
                        color: '#334155',
                        marginTop: 1,
                        lineHeight: 1.1,
                      }}
                    >
                      {req.createdBy?.name || 'Yetkili'}
                    </div>

                  </div>
                </div>

                {printTitle && (
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    textAlign: 'center',
                    maxWidth: '40%',
                  }}>
                    <div style={{
                      fontSize: '9px',
                      fontWeight: 900,
                      color: '#1e293b',
                      textTransform: 'uppercase',
                      lineHeight: 1.2,
                      borderBottom: '1px solid #D9B625',
                      paddingBottom: '2px',
                    }}>
                      {printTitle}
                    </div>
                  </div>
                )}

                <div style={{ textAlign: 'right', fontSize: 8, color: '#1e293b', maxWidth: '38%' }}>
                  <div style={{ fontWeight: 900 }}>{new Date().toLocaleDateString('tr-TR')}</div>
                  <div
                    style={{
                      marginTop: 3,
                      fontFamily: 'ui-monospace, Consolas, monospace',
                      fontWeight: 700,
                      fontSize: 7,
                      lineHeight: 1.25,
                      wordBreak: 'break-all',
                      color: '#334155',
                    }}
                    title="Talep kaydı"
                  >
                    {id}
                  </div>
                </div>
              </div>

              <div style={{ overflow: 'hidden' }}>
                <table className="analysis-table">
                  <thead>
                    <tr className="analysis-thead-row">
                      <th
                        className="col-index"
                        style={{ width: `${reportTableWidths.indexPct.toFixed(2)}%` }}
                      >
                        #
                      </th>
                      {gatedReportColumns.map((colKey) => (
                        <th
                          key={colKey}
                          className={analysisReportThClass(colKey)}
                          style={{
                            width: `${(reportTableWidths.colPct[colKey] ?? 0).toFixed(2)}%`,
                            textAlign:
                              colKey === 'productName' || colKey === 'notes'
                                ? 'left'
                                : 'center',
                            padding: colKey === 'productName' || colKey === 'notes' ? '2px 4px 2px 8px' : '2px 2px',
                          }}
                        >
                          {ANALYSIS_REPORT_COLUMN_LABELS[colKey]}
                        </th>
                      ))}
                      {vendorList.map((v) => {
                        const assignment = req.assignments?.find(
                          (a: {
                            vendorId: string;
                            usdRateFixed?: boolean;
                            usdRate?: number | null;
                            eurRate?: number | null;
                            chfRate?: number | null;
                            quoteNote?: string | null;
                          }) => a.vendorId === v.id,
                        );
                        const lockedUsd = assignmentUsdTry(assignment);
                        const lockedEur = assignmentEurTry(assignment);
                        const lockedChf = assignmentChfTry(assignment);
                        return (
                        <th
                          key={v.id}
                          className="vendor-col-header"
                          style={{
                            width: `${reportTableWidths.vendorEachPct.toFixed(2)}%`,
                            textAlign: 'center',
                            padding: '2px 2px',
                          }}
                        >
                          {v.name}
                          {v.isMarket ? (
                            <div style={{ fontSize: '0.68em', fontWeight: 800, color: '#0369a1', marginTop: 1, letterSpacing: 0.4 }}>
                              ONLINE
                            </div>
                          ) : null}
                          {lockedUsd != null && (
                            <div style={{ fontSize: '0.72em', fontWeight: 700, color: '#0369a1', marginTop: 1 }}>
                              USD {lockedUsd.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </div>
                          )}
                          {lockedEur != null && (
                            <div style={{ fontSize: '0.72em', fontWeight: 700, color: '#0369a1', marginTop: 1 }}>
                              EUR {lockedEur.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </div>
                          )}
                          {lockedChf != null && (
                            <div style={{ fontSize: '0.72em', fontWeight: 700, color: '#0369a1', marginTop: 1 }}>
                              CHF {lockedChf.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ₺
                            </div>
                          )}
                          {assignment?.quoteNote ? (
                            <div
                              style={{ fontSize: '0.68em', fontWeight: 600, color: '#475569', marginTop: 2, lineHeight: 1.25, whiteSpace: 'pre-wrap' }}
                              title={assignment.quoteNote}
                            >
                              {assignment.quoteNote}
                            </div>
                          ) : null}
                        </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {pageItems.map((row) => {
                    if (row.type === 'group-header') {
                      return (
                        <tr key={row.id} className="analysis-row-group">
                          <td
                            colSpan={gatedFixedColCount + vendorCount}
                            style={{
                              height: '5.8mm',
                              backgroundColor: '#D9B625',
                              color: '#1e293b',
                              textAlign: 'center',
                              fontWeight: 900,
                              fontSize: '6.8px',
                              letterSpacing: 1,
                              textTransform: 'uppercase',
                              border: '1px solid #b8960a',
                              verticalAlign: 'middle',
                            }}
                          >
                            {row.groupName}
                          </td>
                        </tr>
                      );
                    }

                    if (row.type === 'group-footer' && !showGroupSubtotals) {
                      return null;
                    }

                    if (row.type === 'group-footer' || row.type === 'grand-total') {
                      const isGrand = row.type === 'grand-total';
                      const allTotals = vendorList.map(v => {
                        let total = 0;
                        let hasAny = false;
                        
                        const assignment = req.assignments?.find((a: { vendorId: string; overallDiscountRate?: number }) => a.vendorId === v.id);
                        const overallDiscount = assignment?.overallDiscountRate || 0;

                        row.items.forEach(item => {
                          const q = item.quotes?.find(qt => qt.vendorId === v.id);
                          if (q) {
                            hasAny = true;
                            const line = quoteLineTotal({
                              price: Number(q.price) || 0,
                              quantity: item.quantity,
                              discountRate: Number(q.discountRate) || 0,
                              vatRate: q.vatRate,
                              applyVat: usesPurchasingQuoteForm(req.moduleId),
                            });
                            total += convertPrice(line, q.currency, targetCurrency, v.id);
                          }
                        });

                        let overallDiscountAmount = 0;
                        if (overallDiscount > 0) {
                          overallDiscountAmount = total * (overallDiscount / 100);
                          total = total - overallDiscountAmount;
                        }

                        return { id: v.id, total, hasAny, overallDiscount, overallDiscountAmount };
                      });

                      return (
                        <tr
                          key={row.id}
                          className={isGrand ? 'analysis-row-grand' : 'analysis-row-subtotal'}
                        >
                          <td colSpan={gatedFixedColCount} style={{ 
                            height: isGrand ? '7.2mm' : '5.8mm', 
                            textAlign: 'right', 
                            paddingRight: '8px',
                            fontWeight: 900, 
                            fontSize: isGrand ? '7px' : '6.2px', 
                            textTransform: 'uppercase',
                            color: isGrand ? '#0f172a' : '#334155',
                            backgroundColor: isGrand ? '#cbd5e1' : '#f1f5f9',
                            border: '1px solid #94a3b8',
                            verticalAlign: 'middle'
                          }}>
                             {row.type === 'grand-total' ? 'GENEL TOPLAM' : `${row.groupName} TOPLAMI`}
                          </td>
                          {allTotals.map(t => {
                            return (
                              <td key={t.id} style={{
                                textAlign: 'right',
                                padding: '2px 5px',
                                fontWeight: 900,
                                fontSize: isGrand ? '7px' : '6.2px',
                                color: t.hasAny ? (isGrand ? '#0f172a' : '#1e293b') : '#94a3b8',
                                backgroundColor: isGrand ? '#e2e8f0' : '#f8fafc',
                                border: '1px solid #cbd5e1',
                                verticalAlign: 'middle'
                              }}>
                                {t.hasAny ? (
                                  reportSettings.showPrices ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                      <div>
                                        {targetCurrency === 'TRY' ? (
                                          <>
                                            {t.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            <span style={{opacity: 0.7, fontSize: '0.9em', marginLeft: 2}}>{getCurrencySymbol(targetCurrency)}</span>
                                          </>
                                        ) : (
                                          <>
                                            <span style={{opacity: 0.7, fontSize: '0.9em', marginRight: 2}}>{getCurrencySymbol(targetCurrency)}</span>
                                            {t.total.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </>
                                        )}
                                      </div>
                                      {t.overallDiscount > 0 && (
                                         <div style={{ fontSize: '6.5px', color: '#15803d', fontWeight: 900, background: '#dcfce7', padding: '1px 3px', borderRadius: 3, marginTop: 1 }}>
                                           %{t.overallDiscount} / -{targetCurrency === 'TRY' ? (
                                             <>{t.overallDiscountAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{getCurrencySymbol(targetCurrency)}</>
                                           ) : (
                                             <>{getCurrencySymbol(targetCurrency)}{t.overallDiscountAmount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>
                                           )}
                                         </div>
                                      )}

                                  </div>
                                  ) : (
                                    <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '12px', padding: '4px 0' }}>***</div>
                                  )
                                ) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    }

                    const item = row.item;
                    const bestVendorIds = getBestVendorIdsForItem(item);
                    const pickRecord = (
                      req as {
                        itemVendorPicks?: { itemId: string; chosenVendorId: string | null }[];
                      }
                    ).itemVendorPicks?.find((p) => p.itemId === item.id);
                    /** Gerçek tedarikçi seçimi kayıtlı mı (seçmeden ilerle = karar yok sayılır) */
                    const hasCommittedPick =
                      pickRecord != null && pickRecord.chosenVendorId != null;

                    return (
                      <tr
                        key={item.id}
                        className={`analysis-row-item${reportSettings.showVendorNotes ? ' analysis-row-item-notes' : ''}`}
                      >
                        <td
                          style={{
                            textAlign: 'center',
                            fontWeight: 900,
                            color: '#94a3b8',
                            backgroundColor: '#f8fafc',
                            verticalAlign: 'middle',
                          }}
                        >
                          {row.globalIndex}
                        </td>
                        {gatedReportColumns.map((colKey) => {
                          if (colKey === 'productName') {
                            return (
                              <td
                                key={colKey}
                                className="analysis-col-product"
                                style={{ padding: '1px 4px', textAlign: 'left', verticalAlign: 'middle' }}
                              >
                                <div
                                  className="analysis-product-name"
                                  style={{
                                    fontWeight: 900,
                                    color: '#0f172a',
                                    fontSize: '1em',
                                    lineHeight: 1.08,
                                  }}
                                >
                                  {item.productName}
                                </div>
                              </td>
                            );
                          }
                          if (colKey === 'notes') {
                            return (
                              <td
                                key={colKey}
                                className="analysis-col-notes"
                                style={{
                                  padding: '1px 4px',
                                  textAlign: 'left',
                                  verticalAlign: 'middle',
                                }}
                              >
                                {item.notes ? item.notes : '—'}
                              </td>
                            );
                          }
                          if (colKey === 'quantity') {
                            return (
                              <td
                                key={colKey}
                                className="analysis-col-qty"
                                style={{ textAlign: 'center', padding: '1px 2px', verticalAlign: 'middle' }}
                              >
                                <span>{item.quantity}</span>
                              </td>
                            );
                          }
                          if (colKey === 'unit') {
                            return (
                              <td
                                key={colKey}
                                className="analysis-col-unit"
                                style={{
                                  textAlign: 'center',
                                  padding: '1px 3px',
                                  verticalAlign: 'middle',
                                }}
                              >
                                {item.unit}
                              </td>
                            );
                          }
                          const textVal =
                            colKey === 'serialNumber'
                              ? item.serialNumber
                              : colKey === 'stockCode'
                                ? item.stockCode
                                : colKey === 'tonnage'
                                  ? item.tonnageInfo
                                  : '';
                          const display =
                            textVal != null && String(textVal).trim() !== '' ? String(textVal) : '—';
                          return (
                            <td
                              key={colKey}
                              className="analysis-col-meta"
                              style={{
                                textAlign: 'center',
                                backgroundColor: '#f8fafc',
                                padding: '1px 2px',
                                verticalAlign: 'middle',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {display}
                            </td>
                          );
                        })}
                        {vendorList.map((v) => {
                          const q = item.quotes?.find((qt) => qt.vendorId === v.id);
                          const isCheapest = !!q && bestVendorIds.has(v.id);
                          let cellClass = '';
                          let cellBg: CSSProperties = {};
                          if (hasCommittedPick && q) {
                            if (v.id === pickRecord!.chosenVendorId) {
                              cellClass = 'vendor-pick-yes';
                              cellBg = { backgroundColor: 'rgba(22, 163, 74, 0.2)' };
                            } else if (isCheapest) {
                              cellClass = 'vendor-best-advantage';
                              cellBg = { backgroundColor: '#fef3c7' };
                            } else {
                              cellClass = 'vendor-pick-no';
                              cellBg = { backgroundColor: 'rgba(239, 68, 68, 0.14)' };
                            }
                          } else if (!hasCommittedPick && isCheapest && q) {
                            cellClass = 'vendor-best-advantage';
                            cellBg = { backgroundColor: '#fef3c7' };
                          }
                          const highlightNt = hasCommittedPick
                            ? v.id === pickRecord!.chosenVendorId
                            : isCheapest;
                          if (!q)
                            return (
                              <td
                                key={v.id}
                                style={{
                                  textAlign: 'center',
                                  color: '#e2e8f0',
                                  fontSize: '1.2em',
                                  verticalAlign: 'middle',
                                }}
                              >
                                —
                              </td>
                            );

                          const itemDiscount = Number(q.discountRate) || 0;
                          const convertedUnitPrice = convertPrice(
                            Number(q.price),
                            q.currency,
                            targetCurrency,
                            q.vendorId
                          );
                          const grossTotal = convertedUnitPrice * item.quantity;
                          const discountAmount = grossTotal * (itemDiscount / 100);
                          const afterDisc = grossTotal - discountAmount;
                          const netTotal =
                            usesPurchasingQuoteForm(req.moduleId)
                              ? quoteLineTotal({
                                  price: convertedUnitPrice,
                                  quantity: item.quantity,
                                  discountRate: itemDiscount,
                                  vatRate: q.vatRate,
                                  applyVat: true,
                                })
                              : afterDisc;

                          return (
                            <td
                              key={v.id}
                              className={cellClass}
                              style={{
                                textAlign: 'right',
                                ...cellBg,
                                padding: '1px 2px',
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                {reportSettings.showPrices ? (
                                  <div
                                    className="analysis-vendor-price-grid"
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                                      columnGap: 4,
                                      rowGap: 0,
                                      alignItems: 'center',
                                      width: '100%',
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: '0.78em',
                                        color: '#475569',
                                        lineHeight: 1.1,
                                        textAlign: 'right',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <span style={{ fontWeight: 900, opacity: 0.72, marginRight: 2 }}>B.F:</span>
                                      <strong>{formatMoney(convertedUnitPrice, targetCurrency)}</strong>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '0.78em',
                                        color: '#334155',
                                        lineHeight: 1.1,
                                        textAlign: 'right',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <span style={{ fontWeight: 900, opacity: 0.72, marginRight: 2 }}>G.T:</span>
                                      <strong>{formatMoney(grossTotal, targetCurrency)}</strong>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '0.72em',
                                        color: itemDiscount > 0 ? '#15803d' : '#64748b',
                                        lineHeight: 1.1,
                                        textAlign: 'right',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <span style={{ fontWeight: 900, opacity: 0.78, marginRight: 2 }}>İsk:</span>
                                      <strong>
                                        {itemDiscount > 0
                                          ? `-${formatMoney(discountAmount, targetCurrency)} (%${itemDiscount.toFixed(2)})`
                                          : '—'}
                                      </strong>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '0.98em',
                                        fontWeight: 900,
                                        color: highlightNt
                                          ? hasCommittedPick
                                            ? '#15803d'
                                            : '#a16207'
                                          : '#0f172a',
                                        lineHeight: 1.1,
                                        textAlign: 'right',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      <span style={{ fontWeight: 900, opacity: 0.7, marginRight: 3 }}>N.T:</span>
                                      {formatMoney(netTotal, targetCurrency)}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', padding: '4px 0' }}>
                                    <CheckCircle2
                                      className={`w-4 h-4 ${
                                        hasCommittedPick
                                          ? v.id === pickRecord!.chosenVendorId
                                            ? 'text-green-600'
                                            : 'text-red-500 opacity-90'
                                          : isCheapest
                                            ? 'text-emerald-600'
                                            : 'text-slate-400 opacity-60'
                                      }`}
                                    />
                                  </div>
                                )}
                                {reportSettings.showVendorNotes && String(q.notes || '').trim() ? (
                                  <div className="analysis-vendor-note">{String(q.notes).trim()}</div>
                                ) : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>

            </div>
          );
        })}
      </div>
      </div>

      {decisionOpen && req && (
        <VendorDecisionDeck
          requestId={id}
          requestTitle={req.title}
          items={orderedItems}
          assignments={req.assignments}
          targetCurrency={targetCurrency}
          rates={rates}
          applyVat={usesPurchasingQuoteForm(req.moduleId)}
          initialChoices={initialDecisionChoices}
          onClose={() => setDecisionOpen(false)}
        />
      )}
    </div>
  );
}

export default AnalysisContent;
