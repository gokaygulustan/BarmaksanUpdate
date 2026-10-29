/**
 * Aynı tedarikçide birebir tekrarlanan yetkili kişi satırlarını siler
 * (ad + e-posta + telefon aynıysa ilki kalır).
 *
 *   node scripts/dedupe-vendor-contacts.mjs          → kuru çalıştırma
 *   node scripts/dedupe-vendor-contacts.mjs --apply  → uygular
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const fold = (value) =>
  String(value ?? '')
    .replace(/[İIı]/g, 'i')
    .replace(/[Şş]/g, 's')
    .replace(/[Ğğ]/g, 'g')
    .replace(/[Üü]/g, 'u')
    .replace(/[Öö]/g, 'o')
    .replace(/[Çç]/g, 'c')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const phoneKey = (value) => String(value ?? '').replace(/\D/g, '').slice(-10);

const vendors = await prisma.vendor.findMany({
  where: { contacts: { some: {} } },
  include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
});

const removable = [];
for (const vendor of vendors) {
  const seen = new Set();
  for (const contact of vendor.contacts) {
    const key = `${fold(contact.name)}|${fold(contact.email)}|${phoneKey(contact.phone)}`;
    if (seen.has(key)) {
      removable.push({ id: contact.id, vendor: vendor.name, label: contact.name || contact.email || contact.phone });
      continue;
    }
    seen.add(key);
  }
}

console.log(removable.map((r) => `${r.vendor} → tekrar: ${r.label}`).join('\n'));
console.log('\n─────────────');
console.log(APPLY ? 'UYGULANDI' : 'KURU ÇALIŞTIRMA (yazma yok)');
console.log('silinecek tekrar satırı:', removable.length);

if (APPLY && removable.length) {
  const res = await prisma.vendorContact.deleteMany({ where: { id: { in: removable.map((r) => r.id) } } });
  console.log('silinen:', res.count, '| kalan yetkili kişi:', await prisma.vendorContact.count());
}

await prisma.$disconnect();
