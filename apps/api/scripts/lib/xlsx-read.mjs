import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * Bağımlılıksız, salt-okunur XLSX çözücü.
 * ZIP merkezi dizinini okur, sayfa XML'ini satır/hücre matrisine çevirir.
 * Sadece ihtiyacımız olan kadarını destekler: paylaşılan metinler, inline metin,
 * sayılar ve hücreye bağlı köprüler (mailto).
 */

const readZipEntries = (filePath) => {
  const buf = fs.readFileSync(filePath);

  // End of central directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP sonu bulunamadı (geçerli bir xlsx değil).');

  const entryCount = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();

  for (let n = 0; n < entryCount; n += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString('utf8', offset + 46, offset + 46 + nameLen);

    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    entries.set(name, method === 0 ? raw : zlib.inflateRawSync(raw));
    offset += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
};

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');

const columnIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** Satır dizisi döndürür: rows[rowIndex][colIndex] = hücre metni */
export const readXlsxRows = (filePath, { sheet = 1 } = {}) => {
  const entries = readZipEntries(filePath);
  const text = (name) => (entries.has(name) ? entries.get(name).toString('utf8') : '');

  const sheetXml = text(`xl/worksheets/sheet${sheet}.xml`);
  if (!sheetXml) throw new Error(`xl/worksheets/sheet${sheet}.xml bulunamadı.`);

  const shared = [];
  for (const m of text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''));
  }

  // Hücreye bağlı köprüler: MAİL sütununda metin boş olup link dolu olabiliyor
  const relTargets = {};
  for (const m of text(`xl/worksheets/_rels/sheet${sheet}.xml.rels`).matchAll(
    /<Relationship Id="([^"]+)"[^>]*Target="([^"]+)"/g,
  )) {
    relTargets[m[1]] = unescapeXml(m[2]);
  }
  const linkByCell = {};
  for (const m of sheetXml.matchAll(/<hyperlink ref="([A-Z]+\d+)"[^>]*r:id="([^"]+)"/g)) {
    linkByCell[m[1]] = (relTargets[m[2]] || '').replace(/^mailto:/i, '');
  }

  const rows = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = cellMatch[1];
      const attrs = cellMatch[2] || '';
      const body = cellMatch[4] || '';
      let value = '';

      if (/t="inlineStr"/.test(attrs)) {
        value = [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join('');
      } else {
        const v = body.match(/<v>([\s\S]*?)<\/v>/);
        if (v) value = /t="s"/.test(attrs) ? shared[Number(v[1])] ?? '' : unescapeXml(v[1]);
      }
      if (!String(value).trim() && linkByCell[ref]) value = linkByCell[ref];

      cells[columnIndex(ref)] = String(value).trim();
    }
    rows[Number(rowMatch[1]) - 1] = cells;
  }

  return rows;
};
