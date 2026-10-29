import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Module Users & Settings seed starting...');
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash('123123', saltRounds);

  const usersData = [
    {
      name: 'Salih Uysal',
      email: 'suysal@ugurpromilling.com',
      password: hashedPassword,
      role: 'ADMIN',
      moduleId: 'IT_DIRECTORATE',
      subRole: 'DIRECTOR',
      isExecutive: true,
    },
    {
      name: 'Kerem Kalender',
      email: 'kkalender@ugurpromilling.com',
      password: hashedPassword,
      role: 'PURCHASING',
      moduleId: 'URETIM_PLANLAMA',
      subRole: 'MANAGER',
    },
    {
      name: 'Mahmut Çorlu',
      email: 'mcorlu@ugurpromilling.com',
      password: hashedPassword,
      role: 'PURCHASING',
      moduleId: 'SATIN_ALMA',
      subRole: 'MANAGER',
    },
    {
      name: 'Mehmet Akif Tura',
      email: 'atura@ugurpromilling.com',
      password: hashedPassword,
      role: 'PURCHASING',
      moduleId: 'SATIN_ALMA',
      subRole: 'STAFF',
    },
    {
      name: 'Ahmet Faruk Akseli',
      email: 'fakseli@ugurpromilling.com',
      password: hashedPassword,
      role: 'PURCHASING',
      moduleId: 'SATIN_ALMA',
      subRole: 'STAFF',
    },
    {
      name: 'Gülnur Gültekin',
      email: 'gnurtekin@ugurpromilling.com',
      password: hashedPassword,
      role: 'PURCHASING',
      moduleId: 'SATIN_ALMA',
      subRole: 'STAFF',
    },
  ];

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        password: u.password,
        role: u.role,
        moduleId: u.moduleId,
        subRole: u.subRole,
        isExecutive: Boolean(u.isExecutive),
        isActive: true,
      },
      create: {
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        moduleId: u.moduleId,
        subRole: u.subRole,
        isExecutive: Boolean(u.isExecutive),
        isActive: true,
      },
    });
    console.log(`✅ User seeded: ${user.name} (${user.email}) - Role: ${user.role}, Module: ${user.moduleId}, SubRole: ${user.subRole}`);
  }

  // Find target Kerem Kalender (kkalender@ugurpromilling.com)
  const targetKerem = await prisma.user.findUnique({ where: { email: 'kkalender@ugurpromilling.com' } });

  if (targetKerem) {
    const oldKerem = await prisma.user.findUnique({ where: { email: 'kerem.kalender@ugurpromilling.com' } });
    if (oldKerem) {
      // Reassign requests created by oldKerem to targetKerem
      await prisma.procurementRequest.updateMany({
        where: { createdById: oldKerem.id },
        data: { createdById: targetKerem.id },
      });
      await prisma.procurementRequest.updateMany({
        where: { assignedToId: oldKerem.id },
        data: { assignedToId: targetKerem.id },
      });
      await prisma.procurementApprovalHistory.updateMany({
        where: { actorUserId: oldKerem.id },
        data: { actorUserId: targetKerem.id },
      });

      // Now safely delete old kerem.kalender user
      await prisma.user.delete({ where: { id: oldKerem.id } });
      console.log('🗑️ kerem.kalender@ugurpromilling.com deleted and data migrated to kkalender@ugurpromilling.com');
    }
  }

  // Set default approval limit
  const limit = await prisma.procurementApprovalLimit.upsert({
    where: { id: 'singleton' },
    update: { limitAmount: 250000, isActive: true },
    create: { id: 'singleton', limitAmount: 250000, isActive: true, moduleId: 'SATIN_ALMA' },
  });
  console.log(`✅ Approval Limit seeded: ${limit.limitAmount} TL (Active: ${limit.isActive})`);

  // Ensure all existing requests have URETIM_PLANLAMA as moduleId if null
  const updatedRequests = await prisma.procurementRequest.updateMany({
    where: { moduleId: undefined },
    data: { moduleId: 'URETIM_PLANLAMA' },
  });
  console.log(`✅ Existing requests tagged with URETIM_PLANLAMA module: ${updatedRequests.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
