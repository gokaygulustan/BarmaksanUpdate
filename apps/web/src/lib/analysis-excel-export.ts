import {
  ANALYSIS_REPORT_COLUMN_KEYS,
  DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY,
  ANALYSIS_REPORT_COLUMN_LABELS,
  compareVendorNames,
  excelWidthForReportColumn,
  type AnalysisReportColumnKey,
  type AnalysisReportColumnVisibility,
} from './analysis-report-columns';
import { quoteLineTotal, ratesWithVendorUsd } from './quoteMath';

export interface ExcelQuote {
  vendorId: string;
  price: number;
  currency: string;
  discountRate?: number;
  vatRate?: number | null;
  notes?: string;
}

type ExcelAssignment = {
  vendorId: string;
  overallDiscountRate?: number;
  usdRateFixed?: boolean | null;
  usdRate?: number | null;
  eurRate?: number | null;
  chfRate?: number | null;
};

export interface ExcelItem {
  id: string;
  productName: string;
  notes?: string;
  quantity: number;
  unit: string;
  serialNumber?: string | null;
  stockCode?: string | null;
  tonnageInfo?: string | null;
  /** Otomatik kategori gruplaması için */
  category?: string;
  quotes?: ExcelQuote[];
}

export type AnalysisExportRow =
  | { kind: 'group'; name: string }
  | { kind: 'item'; globalIndex: number; item: ExcelItem }
  | { kind: 'group-footer'; groupName: string; items: ExcelItem[] }
  | { kind: 'grand-total'; items: ExcelItem[] };

function convertPrice(
  price: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  if (from === to) return price;
  const priceInTry = from === 'TRY' ? price : price * (rates[from] || 1);
  return to === 'TRY' ? priceInTry : priceInTry / (rates[to] || 1);
}

/** Rapor satır sırası; ekrandaki gruplama / ara toplam mantığıyla uyumlu (sayfalama yok). */
export function buildAnalysisExportRows(params: {
  items: ExcelItem[];
  groups: { id: string; name: string }[];
  itemGroups: Record<string, string>;
  showGroupSubtotals: boolean;
}): AnalysisExportRow[] {
  const { items, groups, itemGroups, showGroupSubtotals } = params;
  const out: AnalysisExportRow[] = [];
  let globalIndex = 0;

  if (groups.length === 0) {
    const autoGroups = items.reduce<Record<string, ExcelItem[]>>((acc, item) => {
      const groupName = item.category?.trim() || 'Diğer Ürünler';
      if (!acc[groupName]) acc[groupName] = [];
      acc[groupName].push(item);
      return acc;
    }, {});
    const autoGroupEntries = Object.entries(autoGroups) as Array<[string, ExcelItem[]]>;
    const hasAutoGrouping =
      autoGroupEntries.length > 1 ||
      (autoGroupEntries.length === 1 && autoGroupEntries[0][0] !== 'Diğer Ürünler');

    if (hasAutoGrouping) {
      for (const [groupName, groupItems] of autoGroupEntries) {
        out.push({ kind: 'group', name: groupName });
        for (const it of groupItems) {
          globalIndex++;
          out.push({ kind: 'item', globalIndex, item: it });
        }
        if (showGroupSubtotals) {
          out.push({ kind: 'group-footer', groupName, items: groupItems });
        }
      }
      out.push({ kind: 'grand-total', items });
      return out;
    }

    for (const it of items) {
      globalIndex++;
      out.push({ kind: 'item', globalIndex, item: it });
    }
    if (showGroupSubtotals) {
      out.push({ kind: 'group-footer', groupName: 'Diğer Ürünler', items });
    }
    out.push({ kind: 'grand-total', items });
    return out;
  }

  const groupedItemIds = new Set<string>();
  for (const g of groups) {
    const groupItems = items.filter((i) => itemGroups[i.id] === g.id);
    if (groupItems.length === 0) continue;
    out.push({ kind: 'group', name: g.name });
    for (const it of groupItems) {
      groupedItemIds.add(it.id);
      globalIndex++;
      out.push({ kind: 'item', globalIndex, item: it });
    }
    if (showGroupSubtotals) {
      out.push({ kind: 'group-footer', groupName: g.name, items: groupItems });
    }
  }

  const ungrouped = items.filter((i) => !groupedItemIds.has(i.id));
  if (ungrouped.length > 0) {
    out.push({ kind: 'group', name: 'Diğer Ürünler' });
    for (const it of ungrouped) {
      globalIndex++;
      out.push({ kind: 'item', globalIndex, item: it });
    }
    if (showGroupSubtotals) {
      out.push({ kind: 'group-footer', groupName: 'Diğer Ürünler', items: ungrouped });
    }
  }

  out.push({ kind: 'grand-total', items });
  return out;
}

function colName(index1Based: number): string {
  let n = index1Based;
  let name = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sanitizeFilename(s: string): string {
  const t = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim();
  return t.slice(0, 80) || 'analiz';
}

function getOverallDiscount(
  vendorId: string,
  assignments?: ExcelAssignment[]
): number {
  const a = assignments?.find((x) => x.vendorId === vendorId);
  return Number(a?.overallDiscountRate) || 0;
}

function convertForVendor(
  price: number,
  from: string,
  to: string,
  rates: Record<string, number>,
  vendorId: string,
  assignments?: ExcelAssignment[]
) {
  const a = assignments?.find((x) => x.vendorId === vendorId);
  return convertPrice(price, from, to, ratesWithVendorUsd(rates, a));
}

/** PDF ile aynı: satır bazında en düşük net (TRY) — kalem iskontosu + genel iskonto + (SATIN_ALMA) KDV. */
function getComparableRowNetTotal(
  item: ExcelItem,
  quote: ExcelQuote,
  rates: Record<string, number>,
  assignments?: ExcelAssignment[],
  applyVat?: boolean
): number {
  const net = quoteLineTotal({
    price: Number(quote.price) || 0,
    quantity: item.quantity,
    discountRate: Number(quote.discountRate) || 0,
    vatRate: quote.vatRate,
    overallDiscountRate: getOverallDiscount(quote.vendorId, assignments),
    applyVat: Boolean(applyVat),
  });
  return convertForVendor(net, quote.currency, 'TRY', rates, quote.vendorId, assignments);
}

function getBestVendorIdsForItem(
  item: ExcelItem,
  rates: Record<string, number>,
  assignments?: ExcelAssignment[],
  applyVat?: boolean
): Set<string> {
  if (!item.quotes?.length) return new Set();
  let minValue = Number.POSITIVE_INFINITY;
  const perVendor: Array<{ vendorId: string; total: number }> = [];
  for (const q of item.quotes) {
    const total = getComparableRowNetTotal(item, q, rates, assignments, applyVat);
    perVendor.push({ vendorId: q.vendorId, total });
    if (total < minValue) minValue = total;
  }
  const EPSILON = 0.01;
  return new Set(
    perVendor.filter((v) => Math.abs(v.total - minValue) <= EPSILON).map((v) => v.vendorId)
  );
}

/**
 * Ara toplam / genel toplam: kalem iskontosu satır satır uygulanıp hedef para birimine çevrilir, toplanır.
 * Genel iskonto kalem sayısına bölünmez; bu ara toplam üzerine tek seferde % uygulanır.
 */
function vendorTotalForItems(
  items: ExcelItem[],
  vendorId: string,
  targetCurrency: string,
  rates: Record<string, number>,
  assignments?: ExcelAssignment[],
  applyVat?: boolean
): { total: number; hasAny: boolean; overallDiscount: number; overallDiscountAmount: number } {
  let total = 0;
  let hasAny = false;
  const overallDiscount = getOverallDiscount(vendorId, assignments);

  for (const item of items) {
    const q = item.quotes?.find((qt) => qt.vendorId === vendorId);
    if (!q) continue;
    hasAny = true;
    const line = quoteLineTotal({
      price: Number(q.price) || 0,
      quantity: item.quantity,
      discountRate: Number(q.discountRate) || 0,
      vatRate: q.vatRate,
      applyVat: Boolean(applyVat),
    });
    total += convertForVendor(line, q.currency, targetCurrency, rates, vendorId, assignments);
  }

  let overallDiscountAmount = 0;
  if (overallDiscount > 0 && hasAny) {
    overallDiscountAmount = total * (overallDiscount / 100);
    total -= overallDiscountAmount;
  }

  return { total, hasAny, overallDiscount, overallDiscountAmount };
}

export type DownloadAnalysisExcelParams = {
  reportTitle: string;
  subtitle?: string;
  /** URL’deki talep kimliği (örn. seed_new_2774584a63b6ab4b23) — sayfa numarası yerine üst bilgide gösterilir */
  requestId?: string;
  exportRows: AnalysisExportRow[];
  vendorList: { id: string; name: string }[];
  targetCurrency: string;
  rates: Record<string, number>;
  showPrices: boolean;
  showVendorNotes?: boolean;
  assignments?: ExcelAssignment[];
  applyVat?: boolean;
  /** Önizleme/yazdır ile aynı sütun görünürlüğü; verilmezse tümü açık. */
  columnVisibility?: AnalysisReportColumnVisibility;
};

function excelItemCellValue(key: AnalysisReportColumnKey, it: ExcelItem): string | number {
  switch (key) {
    case 'serialNumber':
      return it.serialNumber != null && String(it.serialNumber).trim() !== '' ? String(it.serialNumber) : '';
    case 'stockCode':
      return it.stockCode != null && String(it.stockCode).trim() !== '' ? String(it.stockCode) : '';
    case 'productName':
      return it.productName ?? '';
    case 'notes':
      return it.notes ?? '';
    case 'tonnage':
      return it.tonnageInfo != null && String(it.tonnageInfo).trim() !== '' ? String(it.tonnageInfo) : '';
    case 'quantity':
      return it.quantity;
    case 'unit':
      return it.unit ?? '';
    default:
      return '';
  }
}

export async function downloadAnalysisExcel(params: DownloadAnalysisExcelParams): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'UP Satın Alım';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Analiz', {
    views: [{ state: 'frozen', ySplit: 5 }],
  });

  const vendors = [...params.vendorList].sort((a, b) => compareVendorNames(a.name, b.name));
  const vis: AnalysisReportColumnVisibility = {
    ...DEFAULT_ANALYSIS_REPORT_COLUMN_VISIBILITY,
    ...params.columnVisibility,
  };
  const orderedKeys = ANALYSIS_REPORT_COLUMN_KEYS.filter((k) => vis[k]);
  const baseCount = 1 + orderedKeys.length;
  const lastCol = baseCount + vendors.length * 4;
  const lastColLetter = colName(lastCol);

  sheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = params.reportTitle;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

  sheet.mergeCells(`A2:${lastColLetter}2`);
  const sub = sheet.getCell('A2');
  sub.value = [
    params.subtitle?.trim(),
    params.requestId?.trim() ? `Talep ID: ${params.requestId.trim()}` : undefined,
    `Para birimi: ${params.targetCurrency}`,
    `Tarih: ${new Date().toLocaleDateString('tr-TR')}`,
  ]
    .filter(Boolean)
    .join('  |  ');
  sub.font = { size: 10 };
  sub.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  sheet.getRow(3).height = 6;

  const baseHeaderLabels = ['#', ...orderedKeys.map((k) => ANALYSIS_REPORT_COLUMN_LABELS[k])];
  for (let i = 0; i < baseHeaderLabels.length; i++) {
    const L = colName(i + 1);
    sheet.mergeCells(`${L}4:${L}5`);
    const c = sheet.getCell(`${L}4`);
    c.value = baseHeaderLabels[i];
    c.font = { bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    c.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  }

  let col = baseCount + 1;
  for (const v of vendors) {
    const start = colName(col);
    const end = colName(col + 3);
    sheet.mergeCells(`${start}4:${end}4`);
    const hc = sheet.getCell(`${start}4`);
    hc.value = v.name;
    hc.font = { bold: true, size: 9 };
    hc.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    hc.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    hc.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    const subLabels = ['B.F:', 'G.T:', 'İsk:', 'N.T:'];
    for (let j = 0; j < 4; j++) {
      const sc = sheet.getRow(5).getCell(col + j);
      sc.value = subLabels[j];
      sc.font = { bold: true, size: 8 };
      sc.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      sc.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }
    col += 4;
  }

  sheet.getRow(4).height = 22;
  sheet.getRow(5).height = 18;

  let dataRowIndex = 6;

  const setBorder = (row: { getCell: (n: number) => { border?: unknown } }, fromCol: number, toCol: number) => {
    for (let c = fromCol; c <= toCol; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    }
  };

  for (const er of params.exportRows) {
    if (er.kind === 'group') {
      const row = sheet.getRow(dataRowIndex);
      sheet.mergeCells(dataRowIndex, 1, dataRowIndex, lastCol);
      const cell = row.getCell(1);
      cell.value = er.name;
      cell.font = { bold: true, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9B625' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      setBorder(row, 1, lastCol);
      dataRowIndex++;
      continue;
    }

    if (er.kind === 'item') {
      const row = sheet.getRow(dataRowIndex);
      const it = er.item;
      row.getCell(1).value = er.globalIndex;
      row.getCell(1).alignment = { horizontal: 'center' };
      let colIdx = 2;
      for (const key of orderedKeys) {
        const val = excelItemCellValue(key, it);
        const cell = row.getCell(colIdx);
        cell.value = val;
        if (key === 'quantity') {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (key === 'unit') {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          cell.alignment = {
            wrapText: true,
            vertical: 'top',
            horizontal: key === 'notes' || key === 'productName' ? 'left' : 'center',
          };
        }
        colIdx++;
      }

      const bestVendorIds = params.showPrices
        ? getBestVendorIdsForItem(it, params.rates, params.assignments, params.applyVat)
        : new Set<string>();

      let c = baseCount + 1;
      for (const v of vendors) {
        const q = it.quotes?.find((qt) => qt.vendorId === v.id);
        if (!params.showPrices) {
          row.getCell(c).value = q ? '✓' : '';
          row.getCell(c + 1).value = '';
          row.getCell(c + 2).value = '';
          row.getCell(c + 3).value = '';
        } else if (!q) {
          row.getCell(c).value = '';
          row.getCell(c + 1).value = '';
          row.getCell(c + 2).value = '';
          row.getCell(c + 3).value = '';
        } else {
          const itemDiscount = Number(q.discountRate) || 0;
          const convertedUnit = convertForVendor(
            Number(q.price) || 0,
            q.currency,
            params.targetCurrency,
            params.rates,
            q.vendorId,
            params.assignments
          );
          const grossTotal = convertedUnit * it.quantity;
          const discountAmount = grossTotal * (itemDiscount / 100);
          const netTotal = quoteLineTotal({
            price: convertedUnit,
            quantity: it.quantity,
            discountRate: itemDiscount,
            vatRate: q.vatRate,
            applyVat: Boolean(params.applyVat),
          });
          row.getCell(c).value = convertedUnit;
          row.getCell(c).numFmt = '#,##0.00';
          row.getCell(c + 1).value = grossTotal;
          row.getCell(c + 1).numFmt = '#,##0.00';
          if (itemDiscount > 0) {
            const pctStr = itemDiscount.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            const amtStr = discountAmount.toLocaleString('tr-TR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
            row.getCell(c + 2).value = `${pctStr}% / -${amtStr}`;
          } else {
            row.getCell(c + 2).value = '—';
          }
          row.getCell(c + 3).value = netTotal;
          row.getCell(c + 3).numFmt = '#,##0.00';
        }
        const isRowCheapest = Boolean(q && bestVendorIds.has(v.id));
        for (let j = 0; j < 4; j++) {
          const cell = row.getCell(c + j);
          cell.alignment = {
            horizontal: 'right',
            vertical: 'middle',
            wrapText: j === 2,
          };
          if (params.showPrices && isRowCheapest) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFDCFCE7' },
            };
            if (j === 3) {
              cell.font = { bold: true, color: { argb: 'FF15803D' } };
            }
          }
        }
        c += 4;
      }

      setBorder(row, 1, lastCol);
      dataRowIndex++;

      if (params.showVendorNotes) {
        const vendorNotes = vendors.map((v) => {
          const q = it.quotes?.find((qt) => qt.vendorId === v.id);
          return String(q?.notes || '').trim();
        });
        if (vendorNotes.some(Boolean)) {
          const noteRow = sheet.getRow(dataRowIndex);
          const labelCell = noteRow.getCell(1);
          labelCell.value = 'Tedarikçi notu';
          labelCell.font = { italic: true, size: 8, color: { argb: 'FF64748B' } };
          labelCell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
          if (baseCount > 1) {
            sheet.mergeCells(dataRowIndex, 1, dataRowIndex, baseCount);
          }
          let nc = baseCount + 1;
          for (let vi = 0; vi < vendors.length; vi++) {
            const cell = noteRow.getCell(nc);
            cell.value = vendorNotes[vi] || '';
            cell.font = { italic: true, size: 8, color: { argb: 'FF475569' } };
            cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
            if (vendorNotes[vi]) {
              cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF8FAFC' },
              };
            }
            sheet.mergeCells(dataRowIndex, nc, dataRowIndex, nc + 3);
            nc += 4;
          }
          const maxLen = Math.max(12, ...vendorNotes.map((n) => n.length));
          noteRow.height = Math.min(52, Math.max(18, Math.ceil(maxLen / 32) * 13));
          setBorder(noteRow, 1, lastCol);
          dataRowIndex++;
        }
      }
      continue;
    }

    const isGrand = er.kind === 'grand-total';
    const label = isGrand ? 'GENEL TOPLAM' : `${er.groupName} TOPLAMI`;
    const items = er.items;

    const row = sheet.getRow(dataRowIndex);
    sheet.mergeCells(dataRowIndex, 1, dataRowIndex, baseCount);
    const lc = row.getCell(1);
    lc.value = label;
    lc.font = { bold: true, size: 10 };
    lc.alignment = { horizontal: 'right', vertical: 'middle' };
    lc.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isGrand ? 'FFCBD5E1' : 'FFF1F5F9' },
    };

    let c = baseCount + 1;
    const totals = vendors.map((v) =>
      vendorTotalForItems(items, v.id, params.targetCurrency, params.rates, params.assignments, params.applyVat)
    );

    for (let vi = 0; vi < vendors.length; vi++) {
      const t = totals[vi];
      if (!params.showPrices) {
        row.getCell(c).value = t.hasAny ? '***' : '—';
        sheet.mergeCells(`${colName(c)}${dataRowIndex}:${colName(c + 3)}${dataRowIndex}`);
        row.getCell(c).alignment = { horizontal: 'center' };
      } else if (!t.hasAny) {
        row.getCell(c).value = '—';
        sheet.mergeCells(`${colName(c)}${dataRowIndex}:${colName(c + 3)}${dataRowIndex}`);
      } else {
        const neutralFill = {
          type: 'pattern' as const,
          pattern: 'solid' as const,
          fgColor: { argb: isGrand ? 'FFE2E8F0' : 'FFF8FAFC' },
        };
        row.getCell(c).value = '';
        row.getCell(c).fill = neutralFill;
        row.getCell(c).font = { color: { argb: 'FF0F172A' } };
        row.getCell(c + 1).value = '';
        row.getCell(c + 1).fill = neutralFill;
        row.getCell(c + 1).font = { color: { argb: 'FF0F172A' } };
        row.getCell(c + 2).value =
          t.overallDiscount > 0
            ? `${t.overallDiscount.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}% / -${t.overallDiscountAmount.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : '';
        row.getCell(c + 2).alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
        row.getCell(c + 2).fill = neutralFill;
        row.getCell(c + 2).font = { color: { argb: 'FF0F172A' } };
        row.getCell(c + 3).value = t.total;
        row.getCell(c + 3).numFmt = '#,##0.00';
        row.getCell(c + 3).font = { bold: true, color: { argb: 'FF0F172A' } };
        row.getCell(c + 3).fill = neutralFill;
        row.getCell(c + 3).alignment = { horizontal: 'right' };
      }
      for (let j = 0; j < 4; j++) {
        const cell = row.getCell(c + j);
        if (!cell.border) {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        }
      }
      c += 4;
    }

    setBorder(row, 1, lastCol);
    dataRowIndex++;
  }

  sheet.getColumn(1).width = 5;
  for (let i = 0; i < orderedKeys.length; i++) {
    sheet.getColumn(i + 2).width = excelWidthForReportColumn(orderedKeys[i]);
  }
  {
    let i = baseCount + 1;
    while (i <= lastCol) {
      sheet.getColumn(i).width = 15;
      sheet.getColumn(i + 1).width = 18;
      sheet.getColumn(i + 2).width = 26;
      sheet.getColumn(i + 3).width = 18;
      i += 4;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(params.reportTitle)}-analiz.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
