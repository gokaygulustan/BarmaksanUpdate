/**
 * Idempotent: mavi yaka birimlerini org_departments'a ekler.
 * Kişisel isimler (Cihat Selçok vb.) dahil edilmez.
 *
 * Usage: node prisma/seed-blue-collar-departments.mjs
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BLUE_COLLAR_UNITS = [
  'ANA DEPO',
  'ELEKTRİKHANE DEPO',
  'Alüminyum İmalat Departmanı',
  'Ambalaj Departmanı',
  'Aspiratör İmalat + Montaj',
  'Atölye Tamirat',
  'Balans Makinesi',
  'Bohrwerk Tezgahı',
  'Boru Depo',
  'Boyahane Departmanı',
  'Boyahane Depo',
  'Cıvata Punta Makinesi',
  'Cleanmax İmalat',
  'CNC Depo',
  'CNC Freze Tezgahı',
  'CNC Torna Tezgahı',
  'Döküm Depo',
  'Düzlem Taşlama Tezgahı',
  'Elek İmalat Departmanı',
  'Elek Kasa Departmanı',
  'Elek Montaj Departmanı',
  'Eksantrik Pres Tezgahı',
  'Etiketleme Departmanı',
  'Fatura Depo',
  'Filtre İmalat Departmanı',
  'Geçici Döküm Depo',
  'Giyotin Makas Tezgahı',
  'Hammadde Ana Depo',
  'Hidrolik Abkant Pres',
  'Hidrolik Pres',
  'İdari Bina Tamirat',
  'İmalat Departmanı',
  'İrmik Sasörü İmalat',
  'Keçehane Depo',
  'Keçehane İmalat',
  'Kenet Makineleri',
  'Kepek Fırçası İmalat',
  'Kılavuz Açma',
  'Kılavuz Açma Makineleri',
  'Kordon Çekme Makineleri',
  'Köşe Kırma',
  'Kumlama Departmanı',
  'Lazer Kesim Makinesi',
  'Lazer Yarı Mamul Depo',
  'Makina Montaj',
  'Mal Kabul Depo',
  'Manuel Kenet',
  'Manuel Silindir',
  'Marangozhane Depo',
  'Marangozhane İmalat',
  'Matkap',
  'Montaj Departmanı',
  'Montaj Malzemeleri Depo',
  'Panch Sac Depo',
  'Plazma Departmanı',
  'Pres',
  'Punch Makinesi',
  'Punta',
  'Radyal Matkap Tezgahı',
  'Robot Kaynak',
  'Sac Depo',
  'Şerit Testere',
  'Sevkiyat Depo',
  'Silindir',
  'Silindir Makineleri',
  'Silindirik Taşlama',
  'Şişe İmalat Departmanı',
  'Ticari Mal Deposu',
  'Top Arabası İmalat Departmanı',
  'Tornahane Departmanı',
  'Ultrator İmalat',
  'Universal Azdırma Tezgahı',
  'Universal Freze Tezgahı',
  'Universal Torna Tezgahı',
  'Universal Vargel Tezgahı',
  'Vals İmalat Departmanı',
  'Vals Montaj Departmanı',
  'Vals Topu Depo',
  'Vals Yarı Mamul Depo',
  'Yedek Parça Depo',
];

async function main() {
  const last = await prisma.department.aggregate({ _max: { sortOrder: true } });
  let sort = last._max.sortOrder || 0;
  let created = 0;
  let skipped = 0;

  for (const name of BLUE_COLLAR_UNITS) {
    const existing = await prisma.department.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      if (existing.collarType !== 'BLUE_COLLAR' || !existing.isActive) {
        await prisma.department.update({
          where: { id: existing.id },
          data: { collarType: 'BLUE_COLLAR', isActive: true },
        });
        console.log('updated:', name);
      } else {
        skipped += 1;
      }
      continue;
    }
    sort += 1;
    await prisma.department.create({
      data: {
        name,
        sortOrder: sort,
        collarType: 'BLUE_COLLAR',
        isActive: true,
      },
    });
    created += 1;
    console.log('created:', name);
  }

  console.log(`Done. created=${created} skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
