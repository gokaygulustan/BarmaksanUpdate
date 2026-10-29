import crypto from 'crypto';
import path from 'path';
import { createRequire } from 'module';
import PDFDocument from 'pdfkit';

const require = createRequire(import.meta.url);
const FONT_DIR = path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')), 'ttf');

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const M = 22;
const CONTENT_W = PAGE_W - M * 2;
const PAGE_BOTTOM = PAGE_H - M - 14;
const MAX_VENDORS_PER_TABLE = 7;
const TZ = 'Europe/Istanbul';

const C = {
  ink: '#0f172a',
  text: '#1e293b',
  muted: '#475569',
  faint: '#64748b',
  line: '#cbd5e1',
  lineStrong: '#94a3b8',
  cardBg: '#f8fafc',
  headBg: '#f1f5f9',
  footBg: '#e2e8f0',
  chosenBg: '#ccebd7',
  bestBg: '#fef3c7',
  tick: '#047857',
  amberBg: '#fffbeb',
  amberLine: '#fbbf24',
  amberText: '#92400e',
  unitBg: '#d9b625',
  unitLine: '#b8960a',
  online: '#075985',
  empty: '#cbd5e1',
};

const formatTRY = (n) =>
  `${Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;

const formatWhen = (raw) => {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
};

const formatDay = (raw) => {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('tr-TR', { timeZone: TZ });
};

const upper = (s) => String(s || '').toLocaleUpperCase('tr-TR');

function tableRows(items) {
  const groups = [];
  const indexByName = new Map();
  for (const item of items) {
    const name = String(item.category || 'GENEL').trim() || 'GENEL';
    const idx = indexByName.get(name);
    if (idx === undefined) {
      indexByName.set(name, groups.length);
      groups.push({ name, items: [item] });
    } else {
      groups[idx].items.push(item);
    }
  }
  const showHeaders = groups.length > 1;
  const rows = [];
  for (const g of groups) {
    if (showHeaders) rows.push({ type: 'unit', name: g.name });
    for (const item of g.items) rows.push({ type: 'item', item });
  }
  return rows;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}

/** Yatay A4 sipariş / onay dosyası. Uzun listeler sayfalara bölünür, tablo başlığı tekrar eder. */
export function renderOrderDossierPdf(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      bufferPages: true,
      pdfVersion: '1.7',
      ownerPassword: crypto.randomBytes(16).toString('hex'),
      permissions: {
        printing: 'highResolution',
        modifying: false,
        copying: true,
        annotating: false,
        fillingForms: false,
        contentAccessibility: true,
        documentAssembly: false,
      },
      info: {
        Title: `Sipariş dosyası — ${data.title || ''}`,
        Author: 'Uğur Promilling Tedarik Portalı',
      },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.registerFont('R', path.join(FONT_DIR, 'DejaVuSansCondensed.ttf'));
    doc.registerFont('B', path.join(FONT_DIR, 'DejaVuSansCondensed-Bold.ttf'));

    const font = (name, size, color = C.text) => doc.font(name).fontSize(size).fillColor(color);
    const textH = (str, name, size, width) => {
      doc.font(name).fontSize(size);
      return doc.heightOfString(String(str ?? ''), { width });
    };
    const box = (x, y, w, h, fill, stroke, radius = 0) => {
      doc.save().lineWidth(0.6);
      if (radius) doc.roundedRect(x, y, w, h, radius);
      else doc.rect(x, y, w, h);
      if (fill && stroke) doc.fillAndStroke(fill, stroke);
      else if (fill) doc.fill(fill);
      else doc.stroke(stroke);
      doc.restore();
    };

    let y = M;

    const ensureSpace = (h) => {
      if (y + h > PAGE_BOTTOM) {
        doc.addPage();
        y = M;
        return true;
      }
      return false;
    };

    // ── Başlık ──
    const rightW = 190;
    const leftW = CONTENT_W - rightW - 12;
    font('B', 7, C.faint).text('UĞUR PROMILLING · SİPARİŞ / ONAY DOSYASI', M, y, {
      width: leftW,
      characterSpacing: 0.8,
    });
    font('R', 7.5, C.faint).text(`Çıktı: ${formatWhen(data.printedAt)}`, M + leftW + 12, y, {
      width: rightW,
      align: 'right',
    });
    font('R', 6.5, '#94a3b8').text(`#${String(data.id || '').slice(-8).toUpperCase()}`, M + leftW + 12, y + 10, {
      width: rightW,
      align: 'right',
    });
    y += 11;
    font('B', 16, C.ink).text(data.title || '—', M, y, { width: leftW });
    y = doc.y + 1;
    const sub = [
      data.createdByName || '',
      data.requesterUnit || '',
      data.neededBy ? `ihtiyaç: ${formatDay(data.neededBy)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (sub) {
      font('R', 8, C.muted).text(sub, M, y, { width: leftW });
      y = doc.y;
    }
    y += 5;
    doc.save().lineWidth(1.4).moveTo(M, y).lineTo(PAGE_W - M, y).stroke(C.ink).restore();
    y += 8;

    // ── Onay izi ──
    const trail = data.approvalTrail || [];
    if (trail.length) {
      const gap = 6;
      const cols = 3;
      const cw = (CONTENT_W - gap * (cols - 1)) / cols;
      for (let i = 0; i < trail.length; i += cols) {
        const row = trail.slice(i, i + cols);
        const heights = row.map((s) => {
          let h = 8 + 9 + textH(s.name || '—', 'B', 9.5, cw - 14) + 2 + 10;
          if (s.note) h += Math.min(textH(s.note, 'R', 7, cw - 14), 36) + 3;
          return h + 6;
        });
        const rh = Math.max(...heights);
        ensureSpace(rh);
        row.forEach((s, j) => {
          const x = M + j * (cw + gap);
          box(x, y, cw, rh, C.cardBg, C.line, 3);
          let cy = y + 6;
          font('B', 6.5, C.faint).text(upper(s.label), x + 7, cy, { width: cw - 14, characterSpacing: 0.4 });
          cy += 9;
          font('B', 9.5, C.ink).text(s.name || '—', x + 7, cy, { width: cw - 14 });
          cy = doc.y + 1;
          font('R', 7.5, C.muted).text(formatWhen(s.at), x + 7, cy, { width: cw - 14 });
          cy = doc.y + 2;
          if (s.note) {
            font('R', 7, C.text).text(s.note, x + 7, cy, { width: cw - 14, height: 36, ellipsis: true });
          }
        });
        y += rh + gap;
      }
    }

    // ── Notlar ──
    const notes = [
      data.unitNote ? { label: 'Birim notu', text: data.unitNote } : null,
      data.managerNote ? { label: 'Yetkili notu', text: data.managerNote } : null,
    ].filter(Boolean);
    if (notes.length) {
      const gap = 6;
      const cw = (CONTENT_W - gap * (notes.length - 1)) / notes.length;
      const rh =
        Math.max(...notes.map((n) => Math.min(textH(n.text, 'R', 7.5, cw - 14), 48))) + 6 + 10 + 6;
      ensureSpace(rh);
      notes.forEach((n, j) => {
        const x = M + j * (cw + gap);
        box(x, y, cw, rh, null, C.line, 3);
        font('B', 6.5, C.faint).text(upper(n.label), x + 7, y + 6, { width: cw - 14, characterSpacing: 0.4 });
        font('R', 7.5, C.text).text(n.text, x + 7, y + 16, { width: cw - 14, height: 48, ellipsis: true });
      });
      y += rh + gap;
    }

    // ── Sipariş verilecek cari ──
    const items = data.items || [];
    const orderVendors = data.orderVendors || [];
    const chosenTotal = items.reduce((sum, it) => {
      const n = it.chosenLineNetTRY;
      return sum + (n != null && Number.isFinite(n) ? n : 0);
    }, 0);
    if (orderVendors.length) {
      const rh =
        7 + 10 + orderVendors.reduce((h, v) => h + 12 + (v.selectedAt ? 10 : 0) + 3, 0) + (chosenTotal > 0 ? 13 : 0) + 5;
      ensureSpace(rh);
      box(M, y, CONTENT_W, rh, C.amberBg, C.amberLine, 3);
      let cy = y + 7;
      font('B', 6.5, C.amberText).text('SİPARİŞ VERİLECEK CARİ', M + 8, cy, { characterSpacing: 0.5 });
      cy += 10;
      for (const v of orderVendors) {
        const meta = `   ${v.itemCount} kalem${v.totalTRY > 0 ? ` · ${formatTRY(v.totalTRY)}` : ''}`;
        font('B', 9.5, C.ink).text(v.vendorName, M + 8, cy, { continued: true });
        font('R', 7.5, C.muted).text(meta);
        cy += 12;
        if (v.selectedAt) {
          font('R', 7.5, C.muted).text(formatWhen(v.selectedAt), M + 8, cy);
          cy += 10;
        }
        cy += 3;
      }
      if (chosenTotal > 0) {
        font('B', 9, C.ink).text(`Seçilen kalemler toplamı (KDV hariç): ${formatTRY(chosenTotal)}`, M + 8, cy);
      }
      y += rh + 8;
    }

    // ── Karşılaştırma tablosu ──
    const allVendors = data.vendors || [];
    const vendorGroups = chunk(allVendors, MAX_VENDORS_PER_TABLE);
    const rows = tableRows(items);

    vendorGroups.forEach((vendors, gi) => {
      const n = Math.max(vendors.length, 1);
      const adetW = 34;
      const vendorW = vendors.length ? Math.min(118, (CONTENT_W - adetW - 140) / n) : 0;
      const kalemW = CONTENT_W - adetW - vendorW * vendors.length;
      const colX = (i) => M + kalemW + adetW + i * vendorW;

      const vendorHeadLines = (v) => {
        const lines = [{ text: v.vendorName || '—', f: 'B', s: 7.5, c: C.ink }];
        if (v.isMarket) {
          lines.push({ text: 'ONLINE', f: 'B', s: 6, c: C.online });
        } else {
          lines.push({ text: `Vade: ${v.maturityLabel || '—'}`, f: 'R', s: 6.5, c: C.muted });
          lines.push({ text: `Nakliye: ${v.shippingLabel || '—'}`, f: 'R', s: 6.5, c: C.muted });
          if (v.city) lines.push({ text: `Şehir: ${v.city}`, f: 'R', s: 6.5, c: C.muted });
          if (
            /hariç/i.test(String(v.shippingLabel || '')) &&
            v.shippingCostTRY != null &&
            Number.isFinite(Number(v.shippingCostTRY))
          ) {
            lines.push({ text: `Nakliye: ${formatTRY(Number(v.shippingCostTRY))}`, f: 'B', s: 6.5, c: C.text });
          }
        }
        return lines;
      };
      const headH = Math.max(
        24,
        ...vendors.map(
          (v) => vendorHeadLines(v).reduce((h, l) => h + textH(l.text, l.f, l.s, vendorW - 6) + 0.5, 0) + 8,
        ),
      );

      const drawHead = () => {
        box(M, y, kalemW, headH, C.headBg, C.line);
        box(M + kalemW, y, adetW, headH, C.headBg, C.line);
        font('B', 6.5, C.muted).text('KALEM', M + 5, y + headH / 2 - 4, { width: kalemW - 10 });
        font('B', 6.5, C.muted).text('ADET', M + kalemW, y + headH / 2 - 4, { width: adetW, align: 'center' });
        vendors.forEach((v, i) => {
          const x = colX(i);
          box(x, y, vendorW, headH, C.headBg, C.line);
          const lines = vendorHeadLines(v);
          const total = lines.reduce((h, l) => h + textH(l.text, l.f, l.s, vendorW - 6) + 0.5, 0);
          let cy = y + (headH - total) / 2;
          for (const l of lines) {
            font(l.f, l.s, l.c).text(l.text, x + 3, cy, { width: vendorW - 6, align: 'center' });
            cy += textH(l.text, l.f, l.s, vendorW - 6) + 0.5;
          }
        });
        y += headH;
      };

      if (vendorGroups.length > 1) {
        const first = gi * MAX_VENDORS_PER_TABLE + 1;
        const last = first + vendors.length - 1;
        if (gi > 0) {
          doc.addPage();
          y = M;
        }
        ensureSpace(12 + headH + 34);
        font('B', 7.5, C.muted).text(
          `TEKLİF KARŞILAŞTIRMASI · CARİLER ${first}–${last} / ${allVendors.length}`,
          M,
          y,
          { characterSpacing: 0.4 },
        );
        y += 12;
      } else {
        ensureSpace(headH + 34);
      }
      drawHead();

      const newPageWithHead = () => {
        doc.addPage();
        y = M;
        drawHead();
      };

      for (const row of rows) {
        if (row.type === 'unit') {
          if (y + 13 + 34 > PAGE_BOTTOM) newPageWithHead();
          box(M, y, CONTENT_W, 13, C.unitBg, C.unitLine);
          font('B', 7, C.ink).text(upper(row.name), M, y + 3, {
            width: CONTENT_W,
            align: 'center',
            characterSpacing: 1.2,
          });
          y += 13;
          continue;
        }

        const item = row.item;
        const unitLabel = String(item.unit || 'Adet').trim() || 'Adet';
        const isAdet = unitLabel.toLocaleLowerCase('tr-TR') === 'adet';
        const qty = Number(item.quantity) || 0;
        const nameH = textH(item.productName, 'B', 7.5, kalemW - 10);
        const rowH = Math.max(34, nameH + 10);
        if (y + rowH > PAGE_BOTTOM) newPageWithHead();

        box(M, y, kalemW, rowH, '#ffffff', C.line);
        font('B', 7.5, C.ink).text(item.productName, M + 5, y + (rowH - nameH) / 2, { width: kalemW - 10 });

        box(M + kalemW, y, adetW, rowH, C.cardBg, C.line);
        const qtyBlock = isAdet ? 11 : 19;
        font('B', 9, C.ink).text(String(item.quantity ?? ''), M + kalemW, y + (rowH - qtyBlock) / 2, {
          width: adetW,
          align: 'center',
        });
        if (!isAdet) {
          font('R', 6, C.faint).text(unitLabel, M + kalemW, y + (rowH - qtyBlock) / 2 + 12, {
            width: adetW,
            align: 'center',
          });
        }

        vendors.forEach((v, i) => {
          const x = colX(i);
          const q = (item.quotes || []).find((qq) => qq.vendorId === v.vendorId);
          if (!q) {
            box(x, y, vendorW, rowH, '#ffffff', C.line);
            font('R', 8, C.empty).text('—', x, y + rowH / 2 - 5, { width: vendorW, align: 'center' });
            return;
          }
          const chosen = item.chosenVendorId === v.vendorId;
          box(x, y, vendorW, rowH, chosen ? C.chosenBg : q.isBestForItem ? C.bestBg : '#ffffff', C.line);
          if (chosen) {
            const cx = x + vendorW - 6;
            const cyT = y + 6;
            doc.save().circle(cx, cyT, 4).fill(C.tick).restore();
            doc
              .save()
              .lineWidth(1)
              .lineCap('round')
              .lineJoin('round')
              .moveTo(cx - 2, cyT + 0.1)
              .lineTo(cx - 0.6, cyT + 1.5)
              .lineTo(cx + 2.1, cyT - 1.5)
              .stroke('#ffffff')
              .restore();
          }
          const line = q.lineNetTRY;
          const unitNet = line != null && Number.isFinite(line) && qty > 0 ? line / qty : null;
          let cy = y + (rowH - 30) / 2;
          font('R', 5.5, C.faint).text('Birim', x, cy, { width: vendorW, align: 'center' });
          cy += 6.5;
          font('B', 8, C.ink).text(unitNet != null ? formatTRY(unitNet) : q.priceLabel || '—', x + 2, cy, {
            width: vendorW - 4,
            align: 'center',
            lineBreak: false,
          });
          cy += 10.5;
          font('R', 5.5, C.faint).text('Toplam', x, cy, { width: vendorW, align: 'center' });
          cy += 6.5;
          font('R', 7, C.text).text(line != null ? formatTRY(line) : '—', x + 2, cy, {
            width: vendorW - 4,
            align: 'center',
            lineBreak: false,
          });
        });
        y += rowH;
      }

      if (items.length && vendors.length) {
        const fh = 18;
        if (y + fh > PAGE_BOTTOM) newPageWithHead();
        box(M, y, kalemW + adetW, fh, C.footBg, C.lineStrong);
        font('B', 7, C.text).text('GENEL TOPLAM', M + 5, y + 5.5, {
          width: kalemW + adetW - 10,
          align: 'right',
          characterSpacing: 0.4,
        });
        vendors.forEach((v, i) => {
          const x = colX(i);
          const filled = items.reduce((sum, it) => {
            const q = (it.quotes || []).find((qq) => qq.vendorId === v.vendorId);
            const nn = q?.lineNetTRY;
            return sum + (nn != null && Number.isFinite(nn) ? nn : 0);
          }, 0);
          box(x, y, vendorW, fh, C.footBg, C.lineStrong);
          font('B', 8, C.ink).text(filled > 0 ? formatTRY(filled) : '—', x + 2, y + 5, {
            width: vendorW - 4,
            align: 'center',
            lineBreak: false,
          });
        });
        y += fh;
      }
      y += 8;
    });

    ensureSpace(12);
    font('R', 6.5, C.faint).text(
      'Tutarlar KDV hariçtir. Sarı hücre: kalemde en uygun teklif. Yeşil hücre / sağ üst tik: sipariş carisi. Bu çıktı dosyalama ve irsaliye eki içindir.',
      M,
      y,
      { width: CONTENT_W },
    );

    const range = doc.bufferedPageRange();
    const footLeft = `${data.title || ''} · #${String(data.id || '').slice(-8).toUpperCase()}`;
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      font('R', 6.5, '#94a3b8').text(footLeft, M, PAGE_H - M - 6, {
        width: CONTENT_W / 2,
        lineBreak: false,
      });
      font('R', 6.5, '#94a3b8').text(`Sayfa ${i - range.start + 1} / ${range.count}`, M + CONTENT_W / 2, PAGE_H - M - 6, {
        width: CONTENT_W / 2,
        align: 'right',
        lineBreak: false,
      });
    }

    doc.end();
  });
}
