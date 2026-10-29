import 'dotenv/config';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { readXlsxRows } from './lib/xlsx-read.mjs';

/**
 * Satın alma ekibinin Excel tedarikçi listesini portala aktarır.
 *
 *   node scripts/import-vendors.mjs --file "C:\\yol\\liste.xlsx" --dry-run
 *   node scripts/import-vendors.mjs --file "C:\\yol\\liste.xlsx"
 *
 * Yalnızca SATIN_ALMA modülüne yazar; üretim tedarikçilerine dokunmaz.
 * Aynı firmanın birden fazla satırı tek tedarikçide birleşir, kişiler
 * vendor_contacts altına düşer.
 */

const argv = process.argv.slice(2);
const argValue = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const FILE = argValue('file');
const DRY_RUN = hasFlag('dry-run');
const MODULE_ID = argValue('module', 'SATIN_ALMA');
const SOURCE = argValue('source', 'Toplu Tedarikçi Listesi (Excel)');
const LIMIT = Number(argValue('limit', '0')) || 0;

if (!FILE) {
  console.error('Kullanım: node scripts/import-vendors.mjs --file "<xlsx yolu>" [--dry-run] [--limit N]');
  process.exit(1);
}

/* ─── Metin yardımcıları ─────────────────────────────────────────────────── */

const TR_MAP = { İ: 'I', I: 'I', ı: 'I', Ş: 'S', ş: 'S', Ğ: 'G', ğ: 'G', Ü: 'U', ü: 'U', Ö: 'O', ö: 'O', Ç: 'C', ç: 'C' };

/** Aksansız, büyük harfli karşılaştırma anahtarı */
const fold = (value) =>
  String(value || '')
    .replace(/[İIıŞşĞğÜüÖöÇç]/g, (ch) => TR_MAP[ch] || ch)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

const cleanName = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "<info@x.com>", "mailto:a@b.c", "a@b.c," gibi sarmalayıcıları temizler */
const splitEmails = (value) =>
  String(value || '')
    .split(/[\s,;/]+/)
    .map((s) =>
      s
        .trim()
        .replace(/^mailto:/i, '')
        .replace(/^[<"'(\[]+|[>"')\].,;]+$/g, '')
        .toLowerCase(),
    )
    .filter(Boolean);

/** 0XXXXXXXXXX biçimine getirir; çözemezse null */
const normalizePhone = (raw) => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `0${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return digits;
  if (digits.length === 12 && digits.startsWith('90')) return `0${digits.slice(2)}`;
  if (digits.length === 13 && digits.startsWith('090')) return `0${digits.slice(3)}`;
  return null;
};

/**
 * Excel'de numaralar "0532 177 95 75", "05380466592-02128862333",
 * "0533.../0545.../0533..." ve "02128869000(1533)" gibi yazılmış.
 * Boşluk ayraç değil; yalnızca / ; , ve numara blokları arasındaki - böler.
 */
const splitPhones = (value) => {
  const parts = String(value || '')
    .split(/[;,/]+|(?<=\d)\s*[-–]\s*(?=0\d{9,})/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '-');

  const phones = [];
  const extensions = [];
  const unresolved = [];

  for (const part of parts) {
    const withExt = part.match(/^(.*?)[(\s]*(?:dah(?:ili)?\.?\s*)?\((\d{2,5})\)\s*$/i);
    const base = withExt ? withExt[1] : part;
    const normalized = normalizePhone(base);
    if (normalized) {
      phones.push(normalized);
      if (withExt) extensions.push(`${normalized} dahili ${withExt[2]}`);
      continue;
    }
    if (/\d/.test(part)) unresolved.push(part.replace(/\s+/g, ' ').trim());
  }

  return { phones: [...new Set(phones)], extensions, unresolved };
};

/* ─── Kategori (ne satıyor) çıkarımı ─────────────────────────────────────── */

/** [etiket, aranan aksansız desenler] — firma adı / açıklama taramasında kullanılır */
const KEYWORDS = [
  ['MOTOR', ['MOTOR']],
  ['REDÜKTÖR', ['REDUKTOR']],
  ['RULMAN', ['RULMAN']],
  ['ÇELİK', ['CELIK']],
  ['PASLANMAZ', ['PASLANMAZ']],
  ['SAC', ['SAC']],
  ['DELİKLİ SAC', ['DELIKLI']],
  ['BORU', ['BORU']],
  ['PROFİL', ['PROFIL']],
  ['LAMA', ['LAMA']],
  ['KÖŞEBENT', ['KOSEBENT']],
  ['NPU', ['NPU']],
  ['TRANSMİSYON', ['TRANSMISYON']],
  ['ALÜMİNYUM', ['ALUMINYUM', 'ALUMINUM', 'ALPROF']],
  ['PİRİNÇ', ['PIRINC']],
  ['BAKIR', ['BAKIR']],
  ['BRONZ', ['BRONZ']],
  ['DÖKÜM', ['DOKUM']],
  ['HIRDAVAT', ['HIRDAVAT']],
  ['CİVATA', ['CIVATA', 'SOMUN']],
  ['FİLTRE', ['FILTRE']],
  ['MADENİ YAĞ', ['MADENI YAG', 'YAGLARI']],
  ['KABLO', ['KABLO']],
  ['HORTUM', ['HORTUM']],
  ['POMPA', ['POMPA']],
  ['VANA', ['VANA']],
  ['HİDROLİK', ['HIDROLIK']],
  ['PNÖMATİK', ['PNOMATIK', 'PNOMATIGI']],
  ['OTOMASYON', ['OTOMASYON']],
  ['ELEKTRİK', ['ELEKTRIK', 'ELEKTRO', 'SALT']],
  ['SENSÖR', ['SENSOR']],
  ['HIZ SÜRÜCÜ', ['HIZ SURUCU', 'SURUCU']],
  ['KAYNAK', ['KAYNAK']],
  ['MATBAA', ['MATBAA']],
  ['ETİKET', ['ETIKET']],
  ['KAĞIT', ['KAGIT']],
  ['KIRTASİYE', ['KIRTASIYE']],
  ['AMBALAJ', ['AMBALAJ']],
  ['BAYRAK', ['BAYRAK']],
  ['TABELA', ['TABELA']],
  ['REKLAM', ['REKLAM']],
  ['PROMOSYON', ['PROMOSYON']],
  ['TEMİZLİK', ['TEMIZLIK', 'TEMIZLEME']],
  ['PEÇETE', ['PECETE']],
  ['BOYA', ['BOYA']],
  ['İŞ KIYAFETİ', ['IS ELBISE', 'KIYAFET', 'ELBISE']],
  ['FIRÇA', ['FIRCA']],
  ['ELEK TELİ', ['ELEK TELI']],
  ['HALI-PASPAS', ['PASPAS', 'HALI']],
  ['AHŞAP', ['ORMAN', 'AHSAP', 'KONTRPLAK']],
  ['KİMYASAL', ['KIMYA']],
  ['LOJİSTİK', ['LOJISTIK', 'NAKLIYE', 'KARGO']],
  ['AKÜ-BATARYA', ['AKU', 'BATARYA']],
  ['REDÜKTÖR YEDEK', ['YEDEK PARCA']],
];

const keywordTags = (text) => {
  const folded = fold(text);
  if (!folded) return [];
  const tags = [];
  for (const [label, patterns] of KEYWORDS) {
    if (patterns.some((p) => folded.includes(p))) tags.push(label);
  }
  return tags;
};

/** SAT.MALZ. hücresi zaten küratörlü: token'ları etiket kabul eder */
const explicitTags = (cell) => {
  const raw = String(cell || '').trim();
  if (!raw) return [];
  return raw
    .split(/[-/,]/)
    .map((s) => cleanName(s))
    .filter((s) => s.length > 1 && s.length <= 28)
    .map((s) => s.toLocaleUpperCase('tr-TR'));
};

const dedupeTags = (tags) => {
  const seen = new Map();
  for (const tag of tags) {
    const key = fold(tag);
    if (!key || seen.has(key)) continue;
    seen.set(key, tag);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'tr'));
};

/* ─── Excel → firma grupları ─────────────────────────────────────────────── */

const COL = { DATE: 0, NAME: 1, CONTACT: 2, MOBILE: 3, OFFICE: 4, FAX: 5, EMAIL: 6, CATEGORY: 9, CITY: 10, NOTE: 11 };

const buildGroups = (rows) => {
  const dataRows = rows
    .slice(2)
    .filter((r) => r && cleanName(r[COL.NAME]))
    .map((r) => Array.from({ length: 12 }, (_, i) => cleanName(r[i] ?? '')));

  const groups = new Map();
  const issues = [];

  for (const row of LIMIT ? dataRows.slice(0, LIMIT) : dataRows) {
    const name = cleanName(row[COL.NAME]);
    const key = fold(name);
    if (!groups.has(key)) {
      groups.set(key, { name, rows: [] });
    }
    const group = groups.get(key);

    const emails = [];
    const badEmails = [];
    for (const candidate of splitEmails(row[COL.EMAIL])) {
      if (EMAIL_RE.test(candidate)) emails.push(candidate.toLowerCase());
      else if (candidate !== '-') {
        badEmails.push(candidate);
        issues.push({ firma: name, tip: 'gecersiz-mail', deger: candidate });
      }
    }

    const { phones, extensions, unresolved } = splitPhones(
      [row[COL.MOBILE], row[COL.OFFICE]].filter(Boolean).join(' / '),
    );
    unresolved.forEach((deger) => issues.push({ firma: name, tip: 'cozulemeyen-telefon', deger }));

    group.rows.push({
      contactName: row[COL.CONTACT] || null,
      emails,
      phones,
      category: row[COL.CATEGORY] || '',
      city: row[COL.CITY] || '',
      note: row[COL.NOTE] || '',
      // Portala düzgün yazılamayan bilgiyi kişi notunda saklıyoruz ki kaybolmasın
      leftovers: [
        extensions.length ? extensions.join(', ') : null,
        unresolved.length ? `Excel telefon: ${unresolved.join(', ')}` : null,
        badEmails.length ? `Excel mail: ${badEmails.join(', ')}` : null,
      ].filter(Boolean),
    });
  }

  const vendors = [...groups.values()].map((group) => {
    const emails = dedupeTags(group.rows.flatMap((r) => r.emails)).map((e) => e.toLowerCase());
    const phones = [...new Set(group.rows.flatMap((r) => r.phones))];
    const city = group.rows.map((r) => r.city).find(Boolean) || null;
    const notes = [...new Set(group.rows.map((r) => r.note).filter(Boolean))].join(' · ') || null;

    const categories = dedupeTags([
      ...group.rows.flatMap((r) => explicitTags(r.category)),
      ...group.rows.flatMap((r) => keywordTags(r.category)),
      ...group.rows.flatMap((r) => keywordTags(r.note)),
      ...keywordTags(group.name),
    ]);

    const contacts = group.rows
      .map((row, index) => ({
        name: row.contactName,
        email: row.emails[0] || null,
        phone: row.phones[0] || null,
        notes: [row.note || null, ...row.leftovers].filter(Boolean).join(' · ') || null,
        isPrimary: index === 0,
      }))
      .filter((c) => c.name || c.email || c.phone);

    return {
      name: group.name,
      contactName: group.rows.map((r) => r.contactName).find(Boolean) || null,
      contactEmail: emails[0] || '',
      extraContactEmails: emails.slice(1),
      contactPhone: phones[0] || null,
      extraContactPhones: phones.slice(1),
      city,
      categories,
      notes,
      contacts,
      excelRowCount: group.rows.length,
    };
  });

  return { vendors, issues };
};

/* ─── Yazma ──────────────────────────────────────────────────────────────── */

const prisma = new PrismaClient();

const mergeArrays = (existing, incoming) => {
  const out = [...(existing || [])];
  const seen = new Set(out.map((v) => fold(v)));
  for (const value of incoming || []) {
    const key = fold(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};

const main = async () => {
  const rows = readXlsxRows(FILE);
  const { vendors, issues } = buildGroups(rows);

  const existing = await prisma.vendor.findMany({
    where: { moduleId: MODULE_ID },
    include: { contacts: true },
  });
  const otherModules = await prisma.vendor.findMany({
    where: { moduleId: { not: MODULE_ID } },
    select: { id: true, name: true, moduleId: true },
  });

  const byName = new Map(existing.map((v) => [fold(v.name), v]));
  const byEmail = new Map();
  const byPhone = new Map();
  for (const vendor of existing) {
    for (const email of [vendor.contactEmail, ...(vendor.extraContactEmails || [])].filter(Boolean)) {
      byEmail.set(String(email).toLowerCase(), vendor);
    }
    for (const phone of [vendor.contactPhone, ...(vendor.extraContactPhones || [])].filter(Boolean)) {
      const normalized = normalizePhone(phone);
      if (normalized) byPhone.set(normalized, vendor);
    }
  }
  const otherModuleNames = new Map(otherModules.map((v) => [fold(v.name), v]));

  const report = { created: [], updated: [], skipped: [], issues, productionNameClash: [] };

  for (const payload of vendors) {
    const clash = otherModuleNames.get(fold(payload.name));
    if (clash) {
      report.productionNameClash.push({ firma: payload.name, modul: clash.moduleId });
    }

    const match =
      byName.get(fold(payload.name)) ||
      payload.extraContactEmails.concat(payload.contactEmail ? [payload.contactEmail] : []).map((e) => byEmail.get(e)).find(Boolean) ||
      [payload.contactPhone, ...payload.extraContactPhones].filter(Boolean).map((p) => byPhone.get(p)).find(Boolean) ||
      null;

    const contactRows = payload.contacts.map((c) => ({
      name: c.name,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      isPrimary: c.isPrimary,
    }));

    if (!match) {
      report.created.push({
        firma: payload.name,
        kisi: contactRows.length,
        kategori: payload.categories,
        mail: payload.contactEmail || '(yok)',
        telefon: payload.contactPhone || '(yok)',
      });
      if (!DRY_RUN) {
        await prisma.vendor.create({
          data: {
            name: payload.name,
            contactName: payload.contactName,
            contactEmail: payload.contactEmail,
            extraContactEmails: payload.extraContactEmails,
            contactPhone: payload.contactPhone,
            extraContactPhones: payload.extraContactPhones,
            city: payload.city,
            categories: payload.categories,
            notes: payload.notes,
            moduleId: MODULE_ID,
            importSource: SOURCE,
            importedAt: new Date(),
            contacts: contactRows.length ? { create: contactRows } : undefined,
          },
        });
      }
      continue;
    }

    // Var olan kayıt: boş alanları doldur, dizileri birleştir, mevcut veriyi ezme
    const data = {
      contactName: match.contactName || payload.contactName,
      contactEmail: match.contactEmail || payload.contactEmail,
      extraContactEmails: mergeArrays(
        match.extraContactEmails,
        [payload.contactEmail, ...payload.extraContactEmails].filter(
          (e) => e && e.toLowerCase() !== String(match.contactEmail || '').toLowerCase(),
        ),
      ),
      contactPhone: match.contactPhone || payload.contactPhone,
      extraContactPhones: mergeArrays(
        match.extraContactPhones,
        [payload.contactPhone, ...payload.extraContactPhones].filter(
          (p) => p && normalizePhone(p) !== normalizePhone(match.contactPhone),
        ),
      ),
      city: match.city || payload.city,
      categories: mergeArrays(match.categories, payload.categories),
      notes: match.notes || payload.notes,
      importSource: match.importSource || SOURCE,
      importedAt: match.importedAt || new Date(),
    };

    const knownContacts = new Set(
      (match.contacts || []).flatMap((c) => [
        c.email ? `e:${c.email.toLowerCase()}` : null,
        c.phone ? `p:${normalizePhone(c.phone) || c.phone}` : null,
        c.name ? `n:${fold(c.name)}` : null,
      ].filter(Boolean)),
    );
    const newContacts = contactRows.filter((c) => {
      const keys = [
        c.email ? `e:${c.email.toLowerCase()}` : null,
        c.phone ? `p:${normalizePhone(c.phone) || c.phone}` : null,
        c.name ? `n:${fold(c.name)}` : null,
      ].filter(Boolean);
      return !keys.some((k) => knownContacts.has(k));
    });

    report.updated.push({
      firma: match.name,
      eklenenKisi: newContacts.length,
      yeniKategori: data.categories.length - (match.categories?.length || 0),
      yeniMail: data.extraContactEmails.length - (match.extraContactEmails?.length || 0),
    });

    if (!DRY_RUN) {
      await prisma.vendor.update({
        where: { id: match.id },
        data: {
          ...data,
          contacts: newContacts.length
            ? { create: newContacts.map((c, i) => ({ ...c, isPrimary: (match.contacts || []).length === 0 && i === 0 })) }
            : undefined,
        },
      });
    }
  }

  const reportPath = path.join(os.tmpdir(), `vendor-import-${DRY_RUN ? 'dryrun' : 'sonuc'}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 1), 'utf8');

  const categoryCount = new Map();
  vendors.forEach((v) => v.categories.forEach((c) => categoryCount.set(c, (categoryCount.get(c) || 0) + 1)));

  console.log(`\n${DRY_RUN ? '[DENEME] ' : ''}Excel satırı: ${vendors.reduce((a, v) => a + v.excelRowCount, 0)} → tekil firma: ${vendors.length}`);
  console.log(`Yeni kayıt: ${report.created.length} · Güncellenen: ${report.updated.length}`);
  console.log(`Maili olmayan firma: ${vendors.filter((v) => !v.contactEmail).length}`);
  console.log(`Kategorisi boş firma: ${vendors.filter((v) => !v.categories.length).length}`);
  console.log(`Birden fazla kişisi olan firma: ${vendors.filter((v) => v.contacts.length > 1).length}`);
  console.log(`Veri sorunu (mail/telefon): ${issues.length}`);
  if (report.productionNameClash.length) {
    console.log(`Üretim modülünde aynı adlı firma (dokunulmadı): ${report.productionNameClash.length}`);
  }
  console.log(
    '\nEn sık kategoriler: ' +
      [...categoryCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([k, v]) => `${k}:${v}`)
        .join(', '),
  );
  console.log(`\nRapor: ${reportPath}`);

  await prisma.$disconnect();
};

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
