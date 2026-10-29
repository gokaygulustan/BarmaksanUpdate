import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const saltRounds = 12; // Matches register() in auth.service.js
  const hashedPassword = await bcrypt.hash('123123', saltRounds);

  // Admin User
  await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: { password: hashedPassword },
    create: {
      name: 'Sistem Yöneticisi',
      email: 'admin@admin.com',
      password: hashedPassword,
      role: 'ADMIN',
    },
  });
  console.log(`✅ Admin güncellendi/oluşturuldu: admin@admin.com / Şifre: 123123`);

  // Purchasing User
  await prisma.user.upsert({
    where: { email: 'satinalma@admin.com' },
    update: { password: hashedPassword },
    create: {
      name: 'Satınalma Sorumlusu',
      email: 'satinalma@admin.com',
      password: hashedPassword,
      role: 'PURCHASING',
    },
  });
  console.log(`✅ Satınalma kullanıcısı güncellendi/oluşturuldu: satinalma@admin.com / Şifre: 123123`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
