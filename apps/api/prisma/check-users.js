import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, moduleId: true, subRole: true }
  });
  console.log(users);
}
main().finally(() => prisma.$disconnect());
