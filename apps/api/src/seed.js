import { prisma } from './lib/prisma.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateShortCode } from './lib/quoteShortCode.js';

async function main() {
  console.log('🌱 Seeding database...');

  // Admin user
  const adminPassword = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@portal.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@portal.com',
      password: adminPassword,
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin user: ${admin.email} / admin123`);

  // Purchasing user
  const purchasingPassword = await bcrypt.hash('purchasing123', 12);
  const purchasing = await prisma.user.upsert({
    where: { email: 'purchasing@portal.com' },
    update: {},
    create: {
      name: 'Purchasing Manager',
      email: 'purchasing@portal.com',
      password: purchasingPassword,
      role: 'PURCHASING',
    },
  });
  console.log(`✅ Purchasing user: ${purchasing.email} / purchasing123`);

  // Supplier user
  const supplierPassword = await bcrypt.hash('supplier123', 12);
  const supplier = await prisma.user.upsert({
    where: { email: 'supplier@portal.com' },
    update: {},
    create: {
      name: 'Supplier Contact',
      email: 'supplier@portal.com',
      password: supplierPassword,
      role: 'SUPPLIER',
    },
  });
  console.log(`✅ Supplier user: ${supplier.email} / supplier123`);

  // Sample vendor linked to the supplier user
  const vendor = await prisma.vendor.upsert({
    where: { userId: supplier.id },
    update: {},
    create: {
      name: 'Acme Supply Co.',
      contactEmail: 'supplier@portal.com',
      contactPhone: '+1 555 000 0000',
      address: '123 Industrial Ave, Istanbul, TR',
      userId: supplier.id,
    },
  });
  console.log(`✅ Vendor: ${vendor.name}`);

  await prisma.mailSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', host: 'smtp.gmail.com', port: 587, secure: false },
    update: {},
  });
  console.log('✅ Mail settings (SMTP) satırı hazır');

  /** Kategorili demo talep: her seed sonrası yeniden oluşturulur (ID değişse de başlık sabit). */
  const SEED_DEMO_TITLE = 'SEED - Kategorili Rapor (ID bağımsız)';
  const tokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const genToken = () => crypto.randomBytes(32).toString('hex');

  await prisma.procurementRequest.deleteMany({ where: { title: SEED_DEMO_TITLE } });

  const demoVendors = [
    { name: 'Rulman ve Güç Aktarım A.Ş.', contactEmail: 'seed.demo.rulman@local.test' },
    { name: 'TEMİZLEME TEDARİK Ltd. Şti.', contactEmail: 'seed.demo.temiz@local.test' },
    { name: 'Barmaksan Sanayi', contactEmail: 'seed.demo.barmaksan@local.test' },
    { name: 'Dijisa Teknoloji A.Ş.', contactEmail: 'seed.demo.dijisa@local.test' },
    { name: 'PELET Sistemleri A.Ş.', contactEmail: 'seed.demo.pelet@local.test' },
  ];

  const seedVendorRows = [];
  for (const v of demoVendors) {
    const found = await prisma.vendor.findFirst({ where: { contactEmail: v.contactEmail } });
    seedVendorRows.push(
      found ??
        (await prisma.vendor.create({
          data: { name: v.name, contactEmail: v.contactEmail },
        }))
    );
  }

  const seedDescription = [
    'Bu kayıt geliştirme ve eğitim amaçlıdır; veritabanı sıfırlansa da seed ile yeniden oluşturulur.',
    '',
    '1) Ödeme: Sipariş onayından sonra fatura ile 30 gün net.',
    '2) Teslimat: Üretim tamamlandığında fabrika teslim (FCA).',
    '3) Garanti: Mekanik parçalar 12 ay; elektrik-otomasyon 24 ay.',
    '4) Alternatif marka: Eşdeğer ürün teklifinde teknik şartnameye uygunluk şartı aranır.',
    '5) Muayene: Sevkiyattan önce birlikte ön kabul yapılabilir.',
  ].join('\n');

  const seedItems = [
    { productName: 'Rulman 6205-2RS', quantity: 8, unit: 'Adet', category: 'DEĞİRMEN BÖLÜMÜ', notes: 'C3 tolerans' },
    { productName: 'Kayış B-1200', quantity: 4, unit: 'Adet', category: 'DEĞİRMEN BÖLÜMÜ', notes: 'Antistatik' },
    { productName: 'Elek gövdesi Ø800', quantity: 1, unit: 'Adet', category: 'DEĞİRMEN BÖLÜMÜ', notes: 'Paslanmaz' },
    { productName: 'Hava kilidi DN200', quantity: 2, unit: 'Adet', category: 'TEMİZLEME BÖLÜMÜ', notes: null },
    { productName: 'Filtre kartuşu G4', quantity: 12, unit: 'Adet', category: 'TEMİZLEME BÖLÜMÜ', notes: 'Yedek set' },
    { productName: 'Helezon redüktör 5.5kW', quantity: 1, unit: 'Adet', category: 'TEMİZLEME BÖLÜMÜ', notes: 'IE3' },
    { productName: 'Bant konveyör 6m', quantity: 1, unit: 'Adet', category: 'TAŞIMA', notes: 'Ayak dahil' },
    { productName: 'Rulman yatağı UCP 210', quantity: 6, unit: 'Adet', category: 'TAŞIMA', notes: null },
    { productName: 'Pelet kalıbı Ø6mm', quantity: 2, unit: 'Adet', category: 'PELETLEME', notes: 'Sert metal' },
    { productName: 'Pres motoru 55kW', quantity: 1, unit: 'Adet', category: 'PELETLEME', notes: null },
    { productName: 'Kontrol paneli PLC', quantity: 1, unit: 'Adet', category: 'GENEL', notes: 'Siemens veya eşdeğer' },
    { productName: 'Kablo kanalı 100x60', quantity: 40, unit: 'Metre', category: 'GENEL', notes: 'Galvaniz' },
  ];

  const seedRequest = await prisma.procurementRequest.create({
    data: {
      title: SEED_DEMO_TITLE,
      description: seedDescription,
      status: 'VENDOR_QUOTED',
      createdById: admin.id,
      assignments: {
        create: seedVendorRows.map((v) => ({
          vendorId: v.id,
          quoteToken: genToken(),
          quoteShortCode: generateShortCode(),
          tokenExpires,
        })),
      },
      items: { create: seedItems },
    },
  });
  console.log(`✅ Kategorili demo talep: "${SEED_DEMO_TITLE}" → id=${seedRequest.id}`);

  console.log('\n🎉 Seed complete! All users:');
  console.log('  admin@portal.com        → password: admin123       (ADMIN)');
  console.log('  purchasing@portal.com   → password: purchasing123  (PURCHASING)');
  console.log('  supplier@portal.com     → password: supplier123    (SUPPLIER)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
