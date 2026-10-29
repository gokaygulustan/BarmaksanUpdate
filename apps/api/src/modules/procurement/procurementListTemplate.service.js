import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { prisma } from '../../lib/prisma.js';
import { decodeMultipartOriginalName } from '../../utils/multipartFilename.js';

export const TEMPLATE_MODULES = ['URETIM_PLANLAMA', 'SATIN_ALMA', 'BIRIM_TALEP'];

export const TEMPLATE_DOWNLOAD_NAMES = {
  URETIM_PLANLAMA: 'Uretim_Talep_Listesi_Sablonu.xlsx',
  SATIN_ALMA: 'Satin_Alma_Talep_Listesi_Sablonu.xlsx',
  BIRIM_TALEP: 'Birim_Talep_Listesi_Sablonu.xlsx',
};

const TEMPLATE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'procurement-list-template');

const GOLD_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};

export function ensureUploadDir() {
  if (!fs.existsSync(TEMPLATE_UPLOAD_DIR)) {
    fs.mkdirSync(TEMPLATE_UPLOAD_DIR, { recursive: true });
  }
}

export function normalizeTemplateModuleId(moduleId) {
  const id = String(moduleId || '').trim();
  // Yedek parça satın alma ile aynı kalem şablonunu kullanır (SN sütunu yok).
  if (id === 'SATIN_ALMA' || id === 'YEDEK_PARCA') return 'SATIN_ALMA';
  if (id === 'BIRIM_TALEP') return 'BIRIM_TALEP';
  return 'URETIM_PLANLAMA';
}

const BRAND_GOLD = 'FFD9B625';
const BRAND_BLACK = 'FF111111';
const THIN_BORDER = { style: 'thin', color: { argb: 'FFD6D3D1' } };

function paintCell(cell, { fill, font, align, border }) {
  if (fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }
  if (font) cell.font = font;
  if (align) cell.alignment = align;
  if (border) {
    cell.border = { top: THIN_BORDER, left: THIN_BORDER, bottom: THIN_BORDER, right: THIN_BORDER };
  }
}

function addEmptyDataRows(ws, startRow, count, lastCol, centerCols = []) {
  const center = new Set(centerCols);
  for (let i = 0; i < count; i++) {
    const row = ws.getRow(startRow + i);
    row.height = 22;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      paintCell(cell, {
        align: {
          vertical: 'middle',
          horizontal: center.has(c) ? 'center' : 'left',
          wrapText: true,
        },
        border: true,
      });
    }
  }
  return startRow + count;
}

function addUnitSeparator(ws, startRow, lastCol) {
  ws.mergeCells(startRow, 1, startRow, lastCol);
  const cell = ws.getCell(startRow, 1);
  cell.value = 'GENEL';
  cell.fill = GOLD_FILL;
  cell.font = { bold: true };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  return startRow + 4;
}

function emptyMeta(moduleId) {
  return {
    moduleId,
    hasCustom: false,
    originalName: null,
    updatedAt: null,
    size: null,
  };
}

function metaFromRow(moduleId, row) {
  if (!row) return emptyMeta(moduleId);
  return {
    moduleId,
    hasCustom: true,
    originalName: row.originalName,
    updatedAt: row.updatedAt.toISOString(),
    size: row.size,
  };
}

/** Üretim: SN | Stok Kodu | Ürün Adı | Açıklama | Tonaj | Miktar | Birim */
export async function buildProductionDefaultBuffer() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Talep Listesi');

  ws.mergeCells('A1:G1');
  const title = ws.getCell('A1');
  title.value = 'TALEP LİSTESİ BAŞLIĞI GİRİNİZ';
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: 'center', vertical: 'middle' };

  const hr = ws.getRow(2);
  ['SN', 'Stok Kodu', 'Ürün Adı', 'Açıklama (zorunlu değil)', 'Tonaj Bilgisi', 'Miktar', 'Birim'].forEach(
    (text, i) => {
      const c = hr.getCell(i + 1);
      c.value = text;
      c.font = { bold: true };
    },
  );

  let r = 3;
  r = addUnitSeparator(ws, r, 7);
  addUnitSeparator(ws, r, 7);

  ws.columns = [
    { width: 10 },
    { width: 18 },
    { width: 42 },
    { width: 36 },
    { width: 22 },
    { width: 14 },
    { width: 16 },
  ];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Satın alma: Ürün Adı | Miktar | Birim | Açıklama */
export async function buildPurchasingDefaultBuffer() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Uğur Promilling';
  const lastCol = 4;
  const ws = wb.addWorksheet('Talep Listesi', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  ws.mergeCells(1, 1, 1, lastCol);
  paintCell(ws.getCell(1, 1), {
    fill: BRAND_BLACK,
    font: { bold: true, size: 14, color: { argb: BRAND_GOLD }, name: 'Calibri' },
    align: { horizontal: 'center', vertical: 'middle' },
  });
  ws.getCell(1, 1).value = 'TALEP LİSTESİ BAŞLIĞI GİRİNİZ';
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  paintCell(ws.getCell(2, 1), {
    fill: 'FFFFFBEB',
    font: { italic: true, size: 9, color: { argb: 'FF78716C' }, name: 'Calibri' },
    align: { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true },
  });
  ws.getCell(2, 1).value = 'Boş satırlara ürün adı, miktar, birim ve açıklamayı doldurun.';
  ws.getRow(2).height = 22;

  const headers = ['Ürün Adı', 'Miktar', 'Birim', 'Açıklama'];
  const hr = ws.getRow(3);
  hr.height = 22;
  headers.forEach((text, i) => {
    const c = hr.getCell(i + 1);
    c.value = text;
    paintCell(c, {
      fill: BRAND_GOLD,
      font: { bold: true, size: 10, color: { argb: BRAND_BLACK }, name: 'Calibri' },
      align: { horizontal: 'center', vertical: 'middle', wrapText: true },
      border: true,
    });
  });

  addEmptyDataRows(ws, 4, 16, lastCol, [2, 3]);

  ws.columns = [{ width: 42 }, { width: 12 }, { width: 14 }, { width: 44 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildDefaultTemplateBuffer(moduleId) {
  const id = normalizeTemplateModuleId(moduleId);
  if (id === 'SATIN_ALMA' || id === 'BIRIM_TALEP') return buildPurchasingDefaultBuffer();
  return buildProductionDefaultBuffer();
}

async function findTemplateRow(moduleId) {
  const id = normalizeTemplateModuleId(moduleId);
  let row = await prisma.procurementListTemplate.findUnique({ where: { id } });
  if (!row && id === 'URETIM_PLANLAMA') {
    row = await prisma.procurementListTemplate.findUnique({ where: { id: 'singleton' } });
  }
  return { id, row };
}

export async function getTemplateMeta(moduleId) {
  const { id, row } = await findTemplateRow(moduleId);
  return metaFromRow(id, row);
}

export async function getAllTemplateMetas() {
  const out = {};
  for (const mid of TEMPLATE_MODULES) {
    out[mid] = await getTemplateMeta(mid);
  }
  return out;
}

export async function getTemplateBufferForDownload(moduleId) {
  ensureUploadDir();
  const { id, row } = await findTemplateRow(moduleId);
  const fallbackName = TEMPLATE_DOWNLOAD_NAMES[id] || TEMPLATE_DOWNLOAD_NAMES.URETIM_PLANLAMA;
  if (row?.storedPath && fs.existsSync(row.storedPath)) {
    return {
      buffer: fs.readFileSync(row.storedPath),
      filename: row.originalName || fallbackName,
      mimeType: row.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }
  const buf = await buildDefaultTemplateBuffer(id);
  return {
    buffer: buf,
    filename: fallbackName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export async function saveUploadedTemplate(file, moduleId) {
  ensureUploadDir();
  const { id, row: existing } = await findTemplateRow(moduleId);

  const destName = `template-${id}-${Date.now()}.xlsx`;
  const destPath = path.join(TEMPLATE_UPLOAD_DIR, destName);
  fs.renameSync(file.path, destPath);

  const stat = fs.statSync(destPath);
  const originalName =
    decodeMultipartOriginalName(file.originalname) || TEMPLATE_DOWNLOAD_NAMES[id];

  try {
    await prisma.procurementListTemplate.upsert({
      where: { id },
      create: {
        id,
        originalName,
        storedPath: destPath,
        mimeType: file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: stat.size,
      },
      update: {
        originalName,
        storedPath: destPath,
        mimeType: file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: stat.size,
      },
    });
  } catch (err) {
    try {
      fs.unlinkSync(destPath);
    } catch {
      // taşınan dosya kayıt olmazsa geride kalmasın
    }
    throw err;
  }

  if (id === 'URETIM_PLANLAMA') {
    try {
      await prisma.procurementListTemplate.delete({ where: { id: 'singleton' } });
    } catch {
      // alias yoksa sorun değil
    }
  }

  const oldPath = existing?.storedPath;
  if (oldPath && oldPath !== destPath && fs.existsSync(oldPath)) {
    try {
      fs.unlinkSync(oldPath);
    } catch {
      // ignore
    }
  }

  return getTemplateMeta(id);
}
