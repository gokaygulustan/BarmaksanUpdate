import type ExcelJS from 'exceljs';

export type ParsedProcurementExcelRow = {
  serialNumber: string;
  stockCode: string;
  productName: string;
  notes: string;
  tonnageInfo: string;
  quantity: number;
  unit: string;
  category: string;
};

export type ParseProcurementListExcelResult = {
  rows: ParsedProcurementExcelRow[];
  /** Excel üst satırındaki talep listesi başlığı (ör. A–G birleşik) */
  listTitle?: string;
};

/** ExcelJS iç birleşim haritası (satır/sütun 1 tabanlı) */
type MergeDim = { top: number; left: number; bottom: number; right: number };

function getWorksheetMerges(ws: ExcelJS.Worksheet): Record<string, MergeDim> {
  const m = (ws as unknown as { _merges?: Record<string, MergeDim> })._merges;
  return m && typeof m === 'object' ? m : {};
}

/**
 * A–G sütunlarını kaplayan birleşik hücre veya tek bir metin içeren satır = şablondaki ünite başlığı.
 */
function isMergedAdBannerRow(ws: ExcelJS.Worksheet, row: number): boolean {
  const r = ws.getRow(row);
  const cell1 = r.getCell(1);

  // A1 master: birleşim haritasında left===1 → master sütun A (col tipi string|number farkı yok)
  if (cell1.isMerged) {
    const master = cell1.master;
    const merges = getWorksheetMerges(ws);
    const dim = merges[master.address];
    if (dim && dim.top === row && dim.bottom === row && dim.left === 1 && dim.right >= 4) {
      return true;
    }
  }

  // Alternatif: Satırda sadece ilk birkaç hücrede metin var ve geri kalanı boşsa (birleşmemiş ama başlık gibi yazılmışsa)
  const val1 = cellToString(cell1);
  const val2 = cellToString(r.getCell(2));
  const val3 = cellToString(r.getCell(3));
  const val6 = cellToString(r.getCell(6));
  
  if (val1 && !val2 && !val3 && !val6) return true;

  return false;
}

function masterCellForRowA(ws: ExcelJS.Worksheet, row: number): ExcelJS.Cell {
  const cell = ws.getCell(row, 1);
  return cell.isMerged ? cell.master : cell;
}

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
  if (typeof o.error === 'string') return '';
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

/** Şablondaki boş yer tutucu (#YOK vb.) */
function emptyPlaceholder(s: string): string {
  const t = s.trim();
  if (!t) return '';
  const n = t.replace(/^#+/, '').replace(/\s+/g, '').toUpperCase();
  if (n === 'YOK' || n === '-' || n === '—' || n === '.') return '';
  return t;
}

function parseQuantityFromRaw(raw: ExcelJS.CellValue | undefined | null): number | null {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    const o = raw as unknown as {
      result?: ExcelJS.CellValue;
      text?: unknown;
      richText?: unknown;
    };
    if ('result' in o) return parseQuantityFromRaw(o.result);
    if (typeof o.text === 'string') return parseQuantityFromRaw(o.text);
    if (Array.isArray(o.richText)) return parseQuantityFromRaw(valueToString(raw));
    return null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  const s = String(raw)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .trim();
  if (!s) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function normalizeHeaderCell(s: string): string {
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

/** Sütun başlığı; ürün adında "ürün" + birim "Adet" olan veri satırlarını başlık sanma. */
function isColumnHeaderRow(row: ExcelJS.Row): boolean {
  const cells: string[] = [];
  for (let c = 1; c <= 16; c++) {
    cells.push(normalizeHeaderCell(cellToString(row.getCell(c))));
  }
  const isUrunHeader = (c: string) =>
    c === 'urun' ||
    c === 'urun adi' ||
    c.startsWith('urun adi') ||
    c.includes('urun adi');
  const isMiktarHeader = (c: string) => c === 'miktar' || c.startsWith('miktar');
  const hasUrunAdi = cells.some(isUrunHeader);
  const hasMiktar = cells.some(isMiktarHeader);
  if (hasUrunAdi && hasMiktar) return true;
  if (hasUrunAdi && cells.some((c) => c === 'adet' || c === 'birim')) return true;
  return false;
}

/**
 * Sütun başlığından önceki satırlar: birleşik hücre ise metin bir kez okunur.
 */
function isPlaceholderListTitle(raw: string): boolean {
  const n = normalizeHeaderCell(raw);
  return n === 'talep listesi basligi' || n.startsWith('talep listesi basligi');
}

function normalizeImportedCategory(raw: string): string {
  const n = normalizeHeaderCell(raw);
  if (!n || n === 'genel' || n.includes('unite adi gir') || n.includes('grup adi gir')) {
    return 'GENEL';
  }
  return raw.replace(/\s+/g, ' ').trim() || 'GENEL';
}

function extractListTitle(ws: ExcelJS.Worksheet, headerRowIdx: number): string | undefined {
  for (let r = 1; r < headerRowIdx; r++) {
    const row = ws.getRow(r);
    if (isMergedAdBannerRow(ws, r)) {
      const t = cellToString(masterCellForRowA(ws, r)).trim();
      if (t.length >= 2 && !isColumnHeaderRow(row) && !isPlaceholderListTitle(t)) return t;
    }
  }
  return undefined;
}

/**
 * Sütun yapısını tespit eder.
 */
function detectColMap(headerRow: ExcelJS.Row): {
  sn: number | null;
  stock: number | null;
  name: number | null;
  notes: number | null;
  tonnage: number | null;
  qty: number | null;
  unit: number | null;
} {
  const map = {
    sn: null as number | null,
    stock: null as number | null,
    name: null as number | null,
    notes: null as number | null,
    tonnage: null as number | null,
    qty: null as number | null,
    unit: null as number | null,
  };
  for (let c = 1; c <= 16; c++) {
    const n = normalizeHeaderCell(cellToString(headerRow.getCell(c)));
    if (!n) continue;
    if (n === 'sn' || n === 'sira no' || n === 'sira') map.sn = map.sn ?? c;
    else if (n.includes('stok')) map.stock = map.stock ?? c;
    else if (n.includes('urun adi') || n === 'urun') map.name = map.name ?? c;
    else if (n.includes('aciklama') || n.includes('teknik')) map.notes = map.notes ?? c;
    else if (n.includes('tonaj')) map.tonnage = map.tonnage ?? c;
    else if (n === 'miktar' || n.startsWith('miktar')) map.qty = map.qty ?? c;
    else if (n === 'birim' || n.startsWith('birim')) map.unit = map.unit ?? c;
  }
  return map;
}

/**
 * Excel dosyasından ürün satırlarını parse eder.
 */
export async function parseProcurementListExcel(file: File): Promise<ParseProcurementListExcelResult> {
  const buf = await file.arrayBuffer();
  const { default: ExcelRuntime } = await import('exceljs');
  const wb = new ExcelRuntime.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) {
    throw new Error('Excel içinde sayfa bulunamadı.');
  }

  let headerRowIdx = 0;
  const maxScan = Math.min(ws.rowCount, 50);
  for (let r = 1; r <= maxScan; r++) {
    if (isColumnHeaderRow(ws.getRow(r))) {
      headerRowIdx = r;
      break;
    }
  }
  
  if (!headerRowIdx) {
    throw new Error('Ürün / Miktar sütun başlıkları bulunamadı. Lütfen şablonu kullanın.');
  }

  const listTitle = extractListTitle(ws, headerRowIdx);
  const col = detectColMap(ws.getRow(headerRowIdx));
  const nameCol = col.name ?? 1;
  const notesCol = col.notes ?? (col.name ? col.name + 1 : 2);
  const qtyCol = col.qty ?? 3;
  const unitCol = col.unit ?? qtyCol + 1;
  const snCol = col.sn;
  const stockCol = col.stock;
  const tonnageCol = col.tonnage;

  let currentCategory = 'GENEL';
  const out: ParsedProcurementExcelRow[] = [];

  for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);

    if (isColumnHeaderRow(row)) continue;

    if (isMergedAdBannerRow(ws, r)) {
      const label = cellToString(masterCellForRowA(ws, r)).trim();
      if (label) {
        currentCategory = normalizeImportedCategory(label);
      }
      continue;
    }

    const productName = cellToString(row.getCell(nameCol));
    const stockCode = stockCol ? emptyPlaceholder(cellToString(row.getCell(stockCol))) : '';
    if (!productName && !stockCode) continue;

    const qtyCell = row.getCell(qtyCol);
    const qty =
      parseQuantityFromRaw(qtyCell.value) ?? parseQuantityFromRaw(cellToString(qtyCell));
    if (qty === null) continue;

    out.push({
      serialNumber: snCol ? emptyPlaceholder(cellToString(row.getCell(snCol))) : '',
      stockCode,
      productName,
      notes: emptyPlaceholder(cellToString(row.getCell(notesCol))),
      tonnageInfo: tonnageCol ? emptyPlaceholder(cellToString(row.getCell(tonnageCol))) : '',
      quantity: qty,
      unit: cellToString(row.getCell(unitCol)) || 'Adet',
      category: normalizeImportedCategory(currentCategory),
    });
  }

  if (out.length === 0) {
    throw new Error(
      'Geçerli ürün satırı bulunamadı. Lütfen "Miktar" sütununun dolu olduğundan ve şablona uyduğunuzdan emin olun.'
    );
  }

  return { rows: out, listTitle };
}

