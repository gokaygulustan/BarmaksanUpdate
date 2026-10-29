import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash('123123', saltRounds);

  const vendorsData = [
    { name: 'Rulman ve Güç Aktarım A.Ş.', prefix: 'rulman' },
    { name: 'Endüstriyel Motor ve Otomasyon', prefix: 'motor' },
    { name: 'Çelik ve Sac Dünyası', prefix: 'celiksac' },
    { name: 'Değirmen Yedek Parça Ltd.', prefix: 'degirmenparca' },
    { name: 'Pnömatik ve Valf Sistemleri', prefix: 'pnomatik' }
  ];

  const commonProducts = [
    { name: 'SKF 6205 Rulman', unit: 'Adet', category: 'Güç Aktarım', description: 'Orjinal SKF 6205 2Z serisi kapalı rulman' },
    { name: 'Yılmaz Redüktör KR Serisi', unit: 'Adet', category: 'Güç Aktarım', description: 'KR Serisi helisel dişlili redüktör' },
    { name: '5.5 kW / 1500 rpm GAMAK Elektrik Motoru', unit: 'Adet', category: 'Motor / Elektronik', description: '5.5 kW Trifaze GAMAK Motor' },
    { name: '3mm Delikli Krom Sac', unit: 'm2', category: 'Metal', description: '3mm kalınlığında elek için delikli paslanmaz sac' },
    { name: 'Helezon Yaprağı (400mm)', unit: 'Metre', category: 'Metal / Yedek Parça', description: '400mm çaplı helezon ileticiler için kıvrılmış yaprak' },
    { name: 'Pnömatik Piston 100x200', unit: 'Adet', category: 'Pnömatik', description: '100mm çap 200mm strok çift etkili piston' },
    { name: 'Poliüretan Vals Topu', unit: 'Adet', category: 'Yedek Parça', description: 'Vals makinaları için özel döküm poliüretan ezici top' },
  ];

  console.log('Değirmencilik Test Seed başlatılıyor...');

  for (const v of vendorsData) {
    const email = `satis@${v.prefix}.com`;
    
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          name: `${v.name} Yetkilisi`,
          email,
          password: hashedPassword,
          role: 'SUPPLIER',
        }
      });
      console.log(`👤 Kullanıcı oluşturuldu: ${email}`);
    } else {
      await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
    }

    let vendor = await prisma.vendor.findUnique({ where: { userId: user.id } });
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: {
          name: v.name,
          contactEmail: email,
          contactPhone: '05553332211',
          address: 'Konya OSB, Değirmenciler Sanayi Sitesi',
          userId: user.id
        }
      });
      console.log(`🏭 Firma oluşturuldu: ${v.name}`);
    }

    for (const p of commonProducts) {
      const existingProduct = await prisma.product.findFirst({
        where: { name: p.name, vendorId: vendor.id }
      });

      if (!existingProduct) {
        await prisma.product.create({
          data: {
            name: p.name,
            unit: p.unit,
            category: p.category,
            description: p.description,
            vendorId: vendor.id
          }
        });
      }
    }
  }

  console.log('✅ Değirmencilik veritabanı başarıyla tohumlandı! Firmalar şifresi: 123123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
