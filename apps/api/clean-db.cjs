const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  console.log('🧹 Veritabanı temizleniyor...\n');

  const req = await prisma.procurementRequest.deleteMany({});
  const cat = await prisma.vendorCatalog.deleteMany({});
  const notif = await prisma.notification.deleteMany({});

  console.log('✅ Silindi:');
  console.log('   Procurement Requests (+ items, quotes, comments, assignments):', req.count);
  console.log('   Vendor Catalogs:', cat.count);
  console.log('   Notifications:', notif.count);
  console.log('\n✔  Kullanıcılar ve Tedarikçi profilleri korundu.');
  await prisma.$disconnect();
}

clean().catch((e) => {
  console.error('Hata:', e.message);
  process.exit(1);
});
