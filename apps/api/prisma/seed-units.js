import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_UNITS = [
  'Adet',
  'Kutu',
  'Paket',
  'Koli',
  'Palet',
  'Set',
  'Takım',
  'Çift',
  'Metre',
  'Metrekare (m²)',
  'Metreküp (m³)',
  'Santimetre (cm)',
  'Milimetre (mm)',
  'Kilogram (kg)',
  'Gram (g)',
  'Ton',
  'Litre',
  'Mililitre (ml)',
  'Rulo',
  'Bidon',
  'Varil',
  'Torba',
  'Makara',
];

async function main() {
  for (const name of DEFAULT_UNITS) {
    const existing = await prisma.unit.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      if (!existing.isSystem) {
        await prisma.unit.update({ where: { id: existing.id }, data: { isSystem: true } });
      }
      continue;
    }
    await prisma.unit.create({ data: { name, isSystem: true } });
  }
  console.log(`✅ ${DEFAULT_UNITS.length} varsayılan ölçü birimi seed edildi.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
