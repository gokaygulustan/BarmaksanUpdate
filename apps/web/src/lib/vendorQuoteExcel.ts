import type ExcelJS from 'exceljs';
import { SITE_BRAND } from '@/lib/brand';
import type { QuoteFormDraftItem } from './quote-form-draft';

const CURRENCIES = new Set(['TRY', 'USD', 'EUR', 'CHF']);
const GOLD = 'FFD9B625';
const BLACK = 'FF111111';
const CREAM = 'FFFFF8E7';
const LOCKED_FILL = 'FFF3F4F6';
const OPEN_FILL = 'FFFFF3BF';
const KAYIT = '_UP_KAYIT';
const MARKER = 'UP-QUOTE-V2';
const SHEET_PASSWORD = 'ugur-teklif';
const YES_NO_LIST = '"EVET,HAYIR"';

export type VendorQuoteExcelItem = {
  id: string;
  category?: string | null;
  productName: string;
  quantity: number;
  unit?: string;
  notes?: string | null;
  serialNumber?: string | null;
  stockCode?: string | null;
  tonnageInfo?: string | null;
};

function valueToString(v: unknown, depth = 0): string {
  if (v == null || depth > 4) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v !== 'object') return String(v).trim();
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.richText)) {
    return o.richText
      .map((t) => valueToString((t as { text?: unknown }).text, depth + 1))
      .join('')
      .trim();
  }
  if (typeof o.text === 'string') return o.text.trim();
  if ('result' in o) return valueToString(o.result, depth + 1);
  return '';
}

function cellToString(cell: ExcelJS.Cell): string {
  if (!cell) return '';
  const src = cell.isMerged ? cell.master : cell;
  const fromValue = valueToString(src.value);
  if (fromValue) return fromValue;
  const text = typeof src.text === 'string' ? src.text.trim() : '';
  if (text && text !== '[object Object]') return text;
  return '';
}

function normText(s: unknown): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function qtyKey(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return normText(raw);
  return String(n);
}

function formatPriceForExcel(raw: string | undefined): number | string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : s;
}

function parsePriceCell(raw: unknown): string {
  if (raw == null || raw === '') return '';
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw).replace('.', ',');
  }
  const s = valueToString(raw).replace(/\s/g, '');
  if (!s) return '';
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return '';
  return String(n).replace('.', ',');
}

function parsePctCell(raw: unknown): string {
  const s = parsePriceCell(raw);
  if (!s) return '';
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return '';
  if (n > 100) return '100';
  return s;
}

function sanitizeFilename(name: string): string {
  const t = name.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (t.slice(0, 60) || 'teklif').trim();
}

function normHeader(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type ColId =
  | 'sn'
  | 'stock'
  | 'group'
  | 'name'
  | 'notes'
  | 'tonnage'
  | 'qty'
  | 'unit'
  | 'price'
  | 'currency'
  | 'discount'
  | 'vat'
  | 'total';

const COL_HEADER: Record<ColId, string> = {
  sn: 'SN',
  stock: 'Stok Kodu',
  group: 'Grup',
  name: 'Ürün Adı',
  notes: 'Açıklama',
  tonnage: 'Tonaj',
  qty: 'Miktar',
  unit: 'Birim',
  price: 'Birim Fiyat',
  currency: 'Para Birimi',
  discount: 'İskonto (%)',
  vat: 'KDV (%)',
  total: 'Toplam',
};

const COL_WIDTH: Record<ColId, number> = {
  sn: 12,
  stock: 16,
  group: 26,
  name: 40,
  notes: 44,
  tonnage: 14,
  qty: 10,
  unit: 12,
  price: 14,
  currency: 14,
  discount: 12,
  vat: 11,
  total: 16,
};

const EDITABLE_COLS = new Set<ColId>(['price', 'currency', 'discount', 'vat']);

export type QuoteExcelLayoutOpts = {
  showProductionMeta?: boolean;
  visibleColumns?: string[];
  isSatinAlma?: boolean;
};

export type QuoteExcelExtras = {
  overallDiscountRate?: string;
  isShippingIncluded?: boolean;
  usdRateFixed?: boolean;
  usdRate?: string;
  eurRate?: string;
  chfRate?: string;
  hasMaturity?: boolean;
  maturityDays?: string;
};

function buildLayout(opts: QuoteExcelLayoutOpts = {}): ColId[] {
  const cols = new Set(
    opts.visibleColumns?.length ? opts.visibleColumns : ['productName', 'quantity', 'unit'],
  );
  const prod = Boolean(opts.showProductionMeta);
  const satin = Boolean(opts.isSatinAlma);
  const layout: ColId[] = [];
  if (prod && cols.has('serialNumber')) layout.push('sn');
  if (prod && cols.has('stockCode')) layout.push('stock');
  layout.push('group', 'name');
  if (cols.has('notes')) layout.push('notes');
  if (prod && cols.has('tonnageInfo')) layout.push('tonnage');
  layout.push('qty', 'unit', 'price', 'currency', 'discount');
  if (satin) layout.push('vat');
  layout.push('total');
  return layout;
}

function parseLayout(raw: string, fallback: ColId[]): ColId[] {
  const allowed = new Set(Object.keys(COL_HEADER) as ColId[]);
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ColId => allowed.has(s as ColId));
  return parts.includes('price') && parts.includes('currency') ? parts : fallback;
}

function excelColLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function groupLabel(raw?: string | null): string {
  const t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Genel';
  const n = t.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  if (n === 'genel') return 'Genel';
  return t;
}

function displayValue(item: VendorQuoteExcelItem, col: ColId): string | number {
  switch (col) {
    case 'sn':
      return item.serialNumber || '';
    case 'stock':
      return item.stockCode || '';
    case 'group':
      return groupLabel(item.category);
    case 'name':
      return item.productName || '';
    case 'notes':
      return item.notes || '';
    case 'tonnage':
      return item.tonnageInfo || '';
    case 'qty':
      return item.quantity;
    case 'unit':
      return item.unit || 'Adet';
    default:
      return '';
  }
}

function snapshotVal(item: VendorQuoteExcelItem, col: ColId): string {
  if (col === 'qty') return qtyKey(item.quantity);
  return normText(displayValue(item, col));
}

function lockedCols(layout: ColId[]): ColId[] {
  return layout.filter((c) => !EDITABLE_COLS.has(c) && c !== 'total');
}

function estimateRowHeight(texts: string[], widths: number[]): number {
  let lines = 1;
  texts.forEach((text, i) => {
    const w = widths[i] || 12;
    const per = Math.max(7, Math.floor(w * 0.9));
    String(text ?? '')
      .split(/\r?\n/)
      .forEach((part) => {
        lines = Math.max(lines, Math.ceil(Math.max(part.length, 1) / per));
      });
  });
  return Math.min(120, Math.max(26, 12 + lines * 16));
}

function paintCell(
  cell: ExcelJS.Cell,
  opts: { fill?: string; font?: Partial<ExcelJS.Font>; align?: Partial<ExcelJS.Alignment>; border?: boolean },
) {
  if (opts.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  }
  if (opts.font) cell.font = opts.font;
  if (opts.align) cell.alignment = opts.align as ExcelJS.Alignment;
  if (opts.border) {
    const edge: ExcelJS.Border = { style: 'thin', color: { argb: 'FFD6D3D1' } };
    cell.border = { top: edge, left: edge, bottom: edge, right: edge };
  }
}

function yesNo(v: boolean | undefined): string {
  return v ? 'EVET' : 'HAYIR';
}

function parseYesNo(raw: unknown): boolean | undefined {
  const n = normHeader(valueToString(raw) || String(raw ?? ''));
  if (n === 'evet' || n === 'yes' || n === 'true' || n === '1') return true;
  if (n === 'hayir' || n === 'no' || n === 'false' || n === '0') return false;
  return undefined;
}

function addYesNoValidation(cell: ExcelJS.Cell) {
  cell.dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: [YES_NO_LIST],
    showErrorMessage: true,
    errorTitle: 'Seçim',
    error: 'EVET veya HAYIR seçin.',
  };
}

function addPercentValidation(cell: ExcelJS.Cell) {
  cell.dataValidation = {
    type: 'decimal',
    operator: 'between',
    formulae: [0, 100],
    allowBlank: true,
    showErrorMessage: true,
    errorTitle: 'İskonto',
    error: 'İskonto 0 ile 100 arasında olmalıdır.',
    showInputMessage: true,
    promptTitle: 'İskonto %',
    prompt: '0–100 arası girin.',
  };
}

type FooterMap = {
  overallRow?: number;
  overallCol?: number;
  shipRow?: number;
  fxRow?: number;
  usdRow?: number;
  eurRow?: number;
  chfRow?: number;
  matRow?: number;
  matDaysRow?: number;
  firstData: number;
  lastData: number;
};

function paintMetaLabel(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.protection = { locked: true };
  paintCell(cell, {
    fill: CREAM,
    font: { size: 10, bold: true, color: { argb: BLACK }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'left', indent: 1 },
    border: true,
  });
}

function paintOpenValue(cell: ExcelJS.Cell, value: ExcelJS.CellValue, extra?: { numFmt?: string }) {
  cell.value = value;
  cell.protection = { locked: false };
  if (extra?.numFmt) cell.numFmt = extra.numFmt;
  paintCell(cell, {
    fill: OPEN_FILL,
    font: { bold: true, size: 11, color: { argb: BLACK }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'center' },
    border: true,
  });
}

function paintLockedTotal(cell: ExcelJS.Cell, formula: string) {
  cell.value = { formula };
  cell.numFmt = '#,##0.00';
  cell.protection = { locked: true };
  paintCell(cell, {
    fill: LOCKED_FILL,
    font: { bold: true, size: 11, color: { argb: BLACK }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'center' },
    border: true,
  });
}

export async function downloadVendorQuoteExcel(params: {
  title: string;
  vendorName?: string;
  quoteDate?: string;
  deadline?: string;
  isSatinAlma: boolean;
  showProductionMeta?: boolean;
  visibleColumns?: string[];
  items: VendorQuoteExcelItem[];
  quotedItems: Record<string, QuoteFormDraftItem>;
  extras?: QuoteExcelExtras;
}): Promise<void> {
  const { title, vendorName, quoteDate, deadline, isSatinAlma, items, quotedItems, extras = {} } = params;
  const layout = buildLayout({
    showProductionMeta: params.showProductionMeta ?? !isSatinAlma,
    visibleColumns: params.visibleColumns,
    isSatinAlma,
  });
  const headers = layout.map((c) => COL_HEADER[c]);
  const lastCol = headers.length;
  const priceCol = layout.indexOf('price') + 1;
  const currencyCol = layout.indexOf('currency') + 1;
  const qtyCol = layout.indexOf('qty') + 1;
  const discountCol = layout.indexOf('discount') + 1;
  const vatCol = layout.indexOf('vat') + 1;
  const totalCol = layout.indexOf('total') + 1;
  const headerRow = 6;
  const firstData = headerRow + 1;
  const lastData = firstData + Math.max(items.length, 1) - 1;
  const widths = layout.map((c) => COL_WIDTH[c]);
  const locked = lockedCols(layout);
  const priceL = excelColLetter(priceCol);
  const qtyL = excelColLetter(qtyCol);
  const discL = excelColLetter(discountCol);
  const vatL = vatCol > 0 ? excelColLetter(vatCol) : '';
  const totL = excelColLetter(totalCol);
  const curL = excelColLetter(currencyCol);

  const { default: ExcelRuntime } = await import('exceljs');
  const wb = new ExcelRuntime.Workbook();
  wb.creator = SITE_BRAND;
  wb.title = title;
  wb.calcProperties.fullCalcOnLoad = true;

  const ws = wb.addWorksheet('Teklif', {
    views: [{ state: 'frozen', ySplit: headerRow, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.mergeCells(1, 1, 1, lastCol);
  paintCell(ws.getCell(1, 1), {
    fill: BLACK,
    font: { bold: true, size: 16, color: { argb: GOLD }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'center' },
  });
  ws.getCell(1, 1).value = SITE_BRAND.toLocaleUpperCase('tr-TR');
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  paintCell(ws.getCell(2, 1), {
    fill: BLACK,
    font: { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'center' },
  });
  ws.getCell(2, 1).value = 'FİYAT TEKLİF FORMU';
  ws.getRow(2).height = 20;

  ws.mergeCells(3, 1, 3, lastCol);
  paintCell(ws.getCell(3, 1), {
    fill: CREAM,
    font: { bold: true, size: 12, color: { argb: BLACK }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'left', indent: 1 },
  });
  ws.getCell(3, 1).value = title || 'Teklif talebi';
  ws.getRow(3).height = 22;

  ws.mergeCells(4, 1, 4, lastCol);
  paintCell(ws.getCell(4, 1), {
    fill: CREAM,
    align: { vertical: 'middle', horizontal: 'left', indent: 1 },
  });
  const restBits = [
    quoteDate ? `Teklif tarihi: ${quoteDate}` : '',
    deadline ? `Son gün: ${deadline}` : '',
  ].filter(Boolean);
  const rest = restBits.length ? `   ·   ${restBits.join('   ·   ')}` : '';
  const muted = { size: 10, color: { argb: 'FF44403C' }, name: 'Calibri' };
  if (vendorName) {
    ws.getCell(4, 1).value = {
      richText: [
        { font: muted, text: 'Tedarikçi: ' },
        { font: { ...muted, bold: true, color: { argb: BLACK }, size: 11 }, text: vendorName },
        ...(rest ? [{ font: muted, text: rest }] : []),
      ],
    };
  } else {
    ws.getCell(4, 1).value = restBits.join('   ·   ');
    ws.getCell(4, 1).font = muted;
  }
  ws.getRow(4).height = 20;

  ws.mergeCells(5, 1, 5, lastCol);
  paintCell(ws.getCell(5, 1), {
    fill: 'FFFFFBEB',
    font: { italic: true, size: 9, color: { argb: 'FF78716C' }, name: 'Calibri' },
    align: { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true },
  });
  ws.getCell(5, 1).value = isSatinAlma
    ? 'Sarı hücreler doldurulur: birim fiyat, para birimi, iskonto, KDV ve alttaki koşullar. Toplam kilitlidir.'
    : 'Sarı hücreler doldurulur: birim fiyat, para birimi, iskonto ve ek iskonto. Toplam kilitlidir.';
  ws.getRow(5).height = 24;

  const hr = ws.getRow(headerRow);
  hr.height = 22;
  headers.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    paintCell(cell, {
      fill: GOLD,
      font: { bold: true, size: 10, color: { argb: BLACK }, name: 'Calibri' },
      align: { vertical: 'middle', horizontal: 'center', wrapText: true },
      border: true,
    });
  });

  items.forEach((item, idx) => {
    const r = firstData + idx;
    const q = quotedItems[item.id] || {};
    const row = ws.getRow(r);
    const wrapTexts: string[] = [];
    const wrapWidths: number[] = [];

    layout.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      if (col === 'price') {
        const priceVal = formatPriceForExcel(q.price);
        cell.value = priceVal === '' ? null : priceVal;
        cell.numFmt = '#,##0.00';
        cell.protection = { locked: false };
        paintCell(cell, {
          fill: OPEN_FILL,
          font: { bold: true, size: 11, color: { argb: BLACK }, name: 'Calibri' },
          align: { vertical: 'middle', horizontal: 'center' },
          border: true,
        });
        return;
      }
      if (col === 'currency') {
        const cur = CURRENCIES.has(String(q.currency || '').toUpperCase())
          ? String(q.currency).toUpperCase()
          : 'TRY';
        cell.value = cur;
        cell.protection = { locked: false };
        paintCell(cell, {
          fill: OPEN_FILL,
          font: { bold: true, size: 10, color: { argb: BLACK }, name: 'Calibri' },
          align: { vertical: 'middle', horizontal: 'center' },
          border: true,
        });
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"TRY,USD,EUR,CHF"'],
          showErrorMessage: true,
          errorTitle: 'Para birimi',
          error: 'TRY, USD, EUR veya CHF seçin.',
        };
        return;
      }
      if (col === 'discount') {
        const discVal = formatPriceForExcel(q.discountRate);
        cell.value = discVal === '' ? null : discVal;
        cell.numFmt = '0.00';
        cell.protection = { locked: false };
        paintCell(cell, {
          fill: OPEN_FILL,
          font: { bold: true, size: 11, color: { argb: BLACK }, name: 'Calibri' },
          align: { vertical: 'middle', horizontal: 'center' },
          border: true,
        });
        addPercentValidation(cell);
        return;
      }
      if (col === 'vat') {
        const vat = ['1', '10', '20'].includes(String(q.vatRate || '')) ? String(q.vatRate) : '20';
        cell.value = Number(vat);
        cell.numFmt = '0';
        cell.protection = { locked: false };
        paintCell(cell, {
          fill: OPEN_FILL,
          font: { bold: true, size: 11, color: { argb: BLACK }, name: 'Calibri' },
          align: { vertical: 'middle', horizontal: 'center' },
          border: true,
        });
        cell.dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: ['"1,10,20"'],
          showErrorMessage: true,
          errorTitle: 'KDV',
          error: '%1, %10 veya %20 seçin.',
        };
        return;
      }
      if (col === 'total') {
        const discPart = `(1-IF(${discL}${r}="",0,${discL}${r})/100)`;
        const vatPart = vatCol > 0 ? `*(1+IF(${vatL}${r}="",20,${vatL}${r})/100)` : '';
        paintLockedTotal(cell, `IF(${priceL}${r}="","",ROUND(${priceL}${r}*${qtyL}${r}*${discPart}${vatPart},2))`);
        return;
      }

      const val = displayValue(item, col);
      cell.value = val as ExcelJS.CellValue;
      cell.protection = { locked: true };
      const center = col === 'qty' || col === 'unit';
      paintCell(cell, {
        fill: LOCKED_FILL,
        font: { size: 10, color: { argb: BLACK }, name: 'Calibri' },
        align: { vertical: 'middle', horizontal: center ? 'center' : 'left', wrapText: true },
        border: true,
      });
      wrapTexts.push(String(val ?? ''));
      wrapWidths.push(widths[i]);
    });
    row.height = estimateRowHeight(wrapTexts, wrapWidths);
  });

  let foot = lastData + 2;
  const footerMap: FooterMap = { firstData, lastData };

  if (isSatinAlma) {
    paintMetaLabel(ws.getCell(foot, 1), 'Nakliye dahil mi?');
    if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
    paintOpenValue(ws.getCell(foot, 3), yesNo(extras.isShippingIncluded ?? true));
    addYesNoValidation(ws.getCell(foot, 3));
    footerMap.shipRow = foot;
    ws.getRow(foot).height = 22;
    foot += 1;

    paintMetaLabel(ws.getCell(foot, 1), 'Döviz kuru sabit mi?');
    if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
    paintOpenValue(ws.getCell(foot, 3), yesNo(extras.usdRateFixed));
    addYesNoValidation(ws.getCell(foot, 3));
    footerMap.fxRow = foot;
    ws.getRow(foot).height = 22;
    foot += 1;

    const rateRows: Array<{ key: 'usdRow' | 'eurRow' | 'chfRow'; label: string; val?: string }> = [
      { key: 'usdRow', label: '1 USD =', val: extras.usdRate },
      { key: 'eurRow', label: '1 EUR =', val: extras.eurRate },
      { key: 'chfRow', label: '1 CHF =', val: extras.chfRate },
    ];
    rateRows.forEach((rr) => {
      paintMetaLabel(ws.getCell(foot, 1), rr.label);
      if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
      const n = formatPriceForExcel(rr.val);
      paintOpenValue(ws.getCell(foot, 3), n === '' ? null : n, { numFmt: '0.00' });
      ws.getCell(foot, 4).value = 'TRY';
      ws.getCell(foot, 4).protection = { locked: true };
      paintCell(ws.getCell(foot, 4), {
        fill: LOCKED_FILL,
        font: { size: 10, color: { argb: BLACK }, name: 'Calibri' },
        align: { vertical: 'middle', horizontal: 'center' },
        border: true,
      });
      footerMap[rr.key] = foot;
      ws.getRow(foot).height = 22;
      foot += 1;
    });

    paintMetaLabel(ws.getCell(foot, 1), 'Vade mevcut mu?');
    if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
    paintOpenValue(ws.getCell(foot, 3), yesNo(extras.hasMaturity));
    addYesNoValidation(ws.getCell(foot, 3));
    footerMap.matRow = foot;
    ws.getRow(foot).height = 22;
    foot += 1;

    paintMetaLabel(ws.getCell(foot, 1), 'Vade (gün)');
    if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
    const days = formatPriceForExcel(extras.maturityDays);
    paintOpenValue(ws.getCell(foot, 3), days === '' ? null : days, { numFmt: '0' });
    footerMap.matDaysRow = foot;
    ws.getRow(foot).height = 22;
    foot += 2;
  }

  let overallAddr = '';
  if (!isSatinAlma) {
    paintMetaLabel(ws.getCell(foot, 1), 'Ek iskonto (%)');
    if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
    const oVal = formatPriceForExcel(extras.overallDiscountRate);
    paintOpenValue(ws.getCell(foot, 3), oVal === '' ? null : oVal, { numFmt: '0.00' });
    addPercentValidation(ws.getCell(foot, 3));
    footerMap.overallRow = foot;
    footerMap.overallCol = 3;
    overallAddr = `C${foot}`;
    ws.getRow(foot).height = 22;
    foot += 1;
  }

  const ekPart = overallAddr ? `*(1-IF(${overallAddr}="",0,${overallAddr})/100)` : '';
  (['TRY', 'USD', 'EUR', 'CHF'] as const).forEach((code) => {
    paintMetaLabel(ws.getCell(foot, 1), `Genel toplam (${code})`);
    if (lastCol >= 2) ws.mergeCells(foot, 1, foot, Math.min(2, lastCol));
    paintLockedTotal(
      ws.getCell(foot, 3),
      `IF(SUMIF(${curL}${firstData}:${curL}${lastData},"${code}",${totL}${firstData}:${totL}${lastData})=0,"",ROUND(SUMIF(${curL}${firstData}:${curL}${lastData},"${code}",${totL}${firstData}:${totL}${lastData})${ekPart},2))`,
    );
    ws.getRow(foot).height = 22;
    foot += 1;
  });

  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  if ((ws.getColumn(1).width || 12) < 28) ws.getColumn(1).width = 28;
  if ((ws.getColumn(3).width || 12) < 16) ws.getColumn(3).width = 16;

  await ws.protect(SHEET_PASSWORD, {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    insertColumns: false,
    insertRows: false,
    deleteColumns: false,
    deleteRows: false,
    sort: false,
    autoFilter: false,
  });

  const kayit = wb.addWorksheet(KAYIT);
  kayit.state = 'veryHidden';
  kayit.getCell(1, 1).value = MARKER;
  kayit.getCell(1, 2).value = headerRow;
  kayit.getCell(1, 3).value = items.length;
  kayit.getCell(1, 4).value = isSatinAlma ? 'SATIN_ALMA' : 'URETIM_PLANLAMA';
  kayit.getCell(1, 5).value = layout.join(',');
  kayit.getCell(1, 6).value = JSON.stringify(footerMap);
  items.forEach((item, idx) => {
    const row = kayit.getRow(idx + 2);
    row.getCell(1).value = item.id;
    locked.forEach((col, i) => {
      row.getCell(i + 2).value = snapshotVal(item, col);
    });
  });
  await kayit.protect(SHEET_PASSWORD, { selectLockedCells: true, selectUnlockedCells: false });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(title)}-teklif.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function detectHeaderMap(row: ExcelJS.Row): Partial<Record<ColId, number>> {
  const map: Partial<Record<ColId, number>> = {};
  for (let c = 1; c <= 24; c++) {
    const n = normHeader(cellToString(row.getCell(c)));
    if (!n) continue;
    if (n === 'birim fiyat' || n === 'fiyat') map.price = map.price ?? c;
    if (n === 'para birimi' || n === 'currency') map.currency = map.currency ?? c;
    if (n.includes('iskonto')) map.discount = map.discount ?? c;
    if (n === 'kdv' || n.startsWith('kdv')) map.vat = map.vat ?? c;
  }
  return map;
}

function readFooterMap(raw: string): FooterMap | null {
  try {
    const o = JSON.parse(raw) as FooterMap;
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

export async function parseVendorQuoteExcel(
  file: File,
  items: VendorQuoteExcelItem[],
  opts: QuoteExcelLayoutOpts & { isSatinAlma?: boolean } = {},
): Promise<{
  updates: Record<string, Partial<QuoteFormDraftItem>>;
  extras: QuoteExcelExtras;
  matched: number;
}> {
  if (!items.length) {
    throw new Error('Yüklenecek kalem yok.');
  }

  const buf = await file.arrayBuffer();
  const { default: ExcelRuntime } = await import('exceljs');
  const wb = new ExcelRuntime.Workbook();
  await wb.xlsx.load(buf);

  const kayit = wb.getWorksheet(KAYIT);
  if (!kayit || cellToString(kayit.getCell(1, 1)) !== MARKER) {
    throw new Error('Bu dosya bu sayfadan indirilen teklif şablonu değil. Lütfen Excel indir ile alınan dosyayı yükleyin.');
  }

  const headerMeta = Number(kayit.getCell(1, 2).value);
  const countMeta = Number(kayit.getCell(1, 3).value);
  if (countMeta !== items.length) {
    throw new Error(
      `Kalem sayısı uyuşmuyor (Excel: ${countMeta}, talep: ${items.length}). Satır ekleyip silmeyin.`,
    );
  }

  for (let i = 0; i < items.length; i++) {
    const id = cellToString(kayit.getRow(i + 2).getCell(1));
    if (id !== items[i].id) {
      throw new Error('Kalem sırası veya gizli kayıt bozulmuş. Lütfen şablonu yeniden indirin.');
    }
  }

  const ws = wb.getWorksheet('Teklif') || wb.worksheets.find((s) => s.name !== KAYIT) || wb.worksheets[0];
  if (!ws) throw new Error('Excel içinde Teklif sayfası bulunamadı.');

  const fallback = buildLayout({
    showProductionMeta: opts.showProductionMeta ?? !opts.isSatinAlma,
    visibleColumns: opts.visibleColumns,
    isSatinAlma: opts.isSatinAlma,
  });
  const layout = parseLayout(cellToString(kayit.getCell(1, 5)), fallback);
  const locked = lockedCols(layout);
  const qtyIndex = locked.indexOf('qty');
  const footerMap = readFooterMap(cellToString(kayit.getCell(1, 6)));

  const headerRow = Number.isFinite(headerMeta) && headerMeta > 0 ? headerMeta : 6;
  const cols = detectHeaderMap(ws.getRow(headerRow));
  const priceCol = cols.price || layout.indexOf('price') + 1;
  const currencyCol = cols.currency || layout.indexOf('currency') + 1;
  if (!priceCol || !currencyCol || priceCol === currencyCol) {
    throw new Error('Başlık satırı bulunamadı. Lütfen bu sayfadan indirdiğiniz Excel’i yükleyin.');
  }
  const discountCol = cols.discount || layout.indexOf('discount') + 1;
  const vatCol = cols.vat || layout.indexOf('vat') + 1;
  const tampered: string[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const row = ws.getRow(headerRow + 1 + i);
    const visible = locked.map((col, idx) => {
      const cell = row.getCell(idx + 1);
      return col === 'qty' || idx === qtyIndex ? qtyKey(cell.value) : normText(cellToString(cell));
    });
    const expected = locked.map((col) => snapshotVal(item, col));
    if (expected.some((v, idx) => v !== visible[idx])) {
      tampered.push(item.productName || `Kalem ${i + 1}`);
    }
  }

  if (tampered.length) {
    const sample = tampered.slice(0, 4).join(', ');
    const extra = tampered.length > 4 ? ` (+${tampered.length - 4})` : '';
    throw new Error(
      `Kilitli alanlar değiştirilmiş (${sample}${extra}). Yalnızca sarı hücreler doldurulabilir.`,
    );
  }

  const updates: Record<string, Partial<QuoteFormDraftItem>> = {};
  for (let i = 0; i < items.length; i++) {
    const row = ws.getRow(headerRow + 1 + i);
    const patch: Partial<QuoteFormDraftItem> = {
      price: parsePriceCell(row.getCell(priceCol).value),
    };
    const cur = cellToString(row.getCell(currencyCol)).toUpperCase();
    if (CURRENCIES.has(cur)) patch.currency = cur;
    if (discountCol > 0) patch.discountRate = parsePctCell(row.getCell(discountCol).value);
    if (vatCol > 0) {
      const vat = parsePriceCell(row.getCell(vatCol).value);
      if (vat === '1' || vat === '10' || vat === '20') patch.vatRate = vat;
    }
    updates[items[i].id] = patch;
  }

  const extras: QuoteExcelExtras = {};
  if (footerMap) {
    if (footerMap.overallRow) {
      extras.overallDiscountRate = parsePctCell(ws.getCell(footerMap.overallRow, footerMap.overallCol || 3).value);
    }
    if (footerMap.shipRow) extras.isShippingIncluded = parseYesNo(ws.getCell(footerMap.shipRow, 3).value);
    if (footerMap.fxRow) extras.usdRateFixed = parseYesNo(ws.getCell(footerMap.fxRow, 3).value);
    if (footerMap.usdRow) extras.usdRate = parsePriceCell(ws.getCell(footerMap.usdRow, 3).value);
    if (footerMap.eurRow) extras.eurRate = parsePriceCell(ws.getCell(footerMap.eurRow, 3).value);
    if (footerMap.chfRow) extras.chfRate = parsePriceCell(ws.getCell(footerMap.chfRow, 3).value);
    if (footerMap.matRow) extras.hasMaturity = parseYesNo(ws.getCell(footerMap.matRow, 3).value);
    if (footerMap.matDaysRow) extras.maturityDays = parsePriceCell(ws.getCell(footerMap.matDaysRow, 3).value);
  }

  return { updates, extras, matched: items.length };
}
