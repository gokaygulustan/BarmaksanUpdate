/**
 * Tek seferlik: "ek bildirim e-postaları" ve "ek telefonlar" alanlarındaki değerleri
 * tedarikçinin Yetkili Kişiler listesine taşır, sonra eski alanları boşaltır.
 *
 * Kullanım:
 *   node scripts/migrate-extra-contacts.mjs          → kuru çalıştırma (hiçbir şey yazmaz)
 *   node scripts/migrate-extra-contacts.mjs --apply  → uygular
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const normEmail = (value) => String(value || '').trim().toLowerCase();
const normPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.slice(-10) : '';
};

const vendors = await prisma.vendor.findMany({
  where: {
    OR: [{ NOT: { extraContactEmails: { isEmpty: true } } }, { NOT: { extraContactPhones: { isEmpty: true } } }],
  },
  include: { contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
});

let createdContacts = 0;
let skipped = 0;
const perModule = {};
const lines = [];

for (const vendor of vendors) {
  perModule[vendor.moduleId] = (perModule[vendor.moduleId] || 0) + 1;

  const knownEmails = new Set(
    [vendor.contactEmail, ...vendor.contacts.map((c) => c.email)].map(normEmail).filter(Boolean),
  );
  const knownPhones = new Set(
    [vendor.contactPhone, ...vendor.contacts.map((c) => c.phone)].map(normPhone).filter(Boolean),
  );

  const newRows = [];

  for (const email of vendor.extraContactEmails || []) {
    const key = normEmail(email);
    if (!key || knownEmails.has(key)) {
      skipped += 1;
      continue;
    }
    knownEmails.add(key);
    newRows.push({ email: key, notes: 'Ek bildirim adresi' });
  }

  for (const phone of vendor.extraContactPhones || []) {
    const key = normPhone(phone);
    if (!key || knownPhones.has(key)) {
      skipped += 1;
      continue;
    }
    knownPhones.add(key);
    // Numarayı olduğu gibi saklıyoruz (dahili notu varsa kaybolmasın)
    newRows.push({ phone: String(phone).trim(), notes: 'Ek numara' });
  }

  lines.push(
    `${vendor.name} [${vendor.moduleId}] mevcut kişi: ${vendor.contacts.length} → eklenecek: ${newRows.length}` +
      (newRows.length ? `\n    ${newRows.map((r) => r.email || r.phone).join(' | ')}` : ''),
  );

  if (!APPLY) {
    createdContacts += newRows.length;
    continue;
  }

  await prisma.$transaction(async (tx) => {
    for (const row of newRows) {
      await tx.vendorContact.create({
        data: {
          vendorId: vendor.id,
          name: null,
          title: null,
          email: row.email || null,
          phone: row.phone || null,
          notes: row.notes,
          isPrimary: false,
        },
      });
    }
    await tx.vendor.update({
      where: { id: vendor.id },
      data: { extraContactEmails: [], extraContactPhones: [] },
    });
  });
  createdContacts += newRows.length;
}

console.log(lines.join('\n'));
console.log('\n─────────────────────────────');
console.log(APPLY ? 'UYGULANDI' : 'KURU ÇALIŞTIRMA (yazma yok)');
console.log('etkilenen tedarikçi:', vendors.length, '| modüller:', perModule);
console.log('oluşturulan yetkili kişi satırı:', createdContacts);
console.log('zaten kayıtlı olduğu için atlanan:', skipped);

await prisma.$disconnect();
