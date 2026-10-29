import type ExcelJS from 'exceljs';

const BRAND_GOLD = 'FFD9B625';
const BRAND_BLACK = 'FF111111';
const THIN = { style: 'thin' as const, color: { argb: 'FFD6D3D1' } };

function paint(
  cell: ExcelJS.Cell,
  opts: {
    fill?: string;
    font?: Partial<ExcelJS.Font>;
    align?: Partial<ExcelJS.Alignment>;
    border?: boolean;
  }
) {
  if (opts.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  }
  if (opts.font) cell.font = opts.font as ExcelJS.Font;
  if (opts.align) cell.alignment = opts.align as ExcelJS.Alignment;
  if (opts.border) {
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  }
}

/** Birim talebi şablonu: başlık + Ürün Adı | Miktar | Birim | Açıklama */
export async function downloadBirimTalepTemplate(titleHint?: string) {
  // ExcelJS (~1 MB) yalnızca dosya gerçekten indirilirken yüklenir; sayfa paketine girmez.
  const { default: ExcelRuntime } = await import('exceljs');
  const wb = new ExcelRuntime.Workbook();
  wb.creator = 'Uğur Promilling';
  const lastCol = 4;
  const ws = wb.addWorksheet('Talep Listesi', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
  });

  ws.mergeCells(1, 1, 1, lastCol);
  paint(ws.getCell(1, 1), {
    fill: BRAND_BLACK,
    font: { bold: true, size: 14, color: { argb: BRAND_GOLD }, name: 'Calibri' },
    align: { horizontal: 'center', vertical: 'middle' },
  });
  ws.getCell(1, 1).value = titleHint?.trim() || 'TALEP LİSTESİ BAŞLIĞI GİRİNİZ';
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  paint(ws.getCell(2, 1), {
    fill: 'FFFFFBEB',
    font: { italic: true, size: 9, color: { argb: 'FF78716C' }, name: 'Calibri' },
    align: { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true },
  });
  ws.getCell(2, 1).value =
    'Ürün adı, miktar ve birimi doldurun. Birim listede yoksa (ör. Koli, Teneke) olduğu gibi yazın. Açıklama isteğe bağlıdır.';
  ws.getRow(2).height = 22;

  const headers = ['Ürün Adı', 'Miktar', 'Birim', 'Açıklama'];
  const hr = ws.getRow(3);
  hr.height = 22;
  headers.forEach((text, i) => {
    const c = hr.getCell(i + 1);
    c.value = text;
    paint(c, {
      fill: BRAND_GOLD,
      font: { bold: true, size: 10, color: { argb: BRAND_BLACK }, name: 'Calibri' },
      align: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: true,
    });
  });

  for (let i = 0; i < 16; i++) {
    const row = ws.getRow(4 + i);
    row.height = 22;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      paint(cell, {
        align: {
          vertical: 'middle',
          horizontal: c === 2 || c === 3 ? 'center' : 'left',
          wrapText: true,
        },
        border: true,
      });
    }
  }

  ws.columns = [{ width: 42 }, { width: 14 }, { width: 16 }, { width: 36 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Birim_Talep_Listesi_Sablonu.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
