import { login } from './src/modules/auth/auth.service.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      console.log('No users found in database');
      return;
    }
    console.log('Found user:', user.email);
    console.log('Testing login logic...');
    
    // We can't easily test with password without knowing it, 
    // but at least let's check if the query with 'include' works.
    const userWithVendor = await prisma.user.findUnique({ 
      where: { email: user.email },
      include: { vendor: { select: { id: true, name: true } } }
    });
    console.log('Query successful. User vendor:', userWithVendor.vendor);
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
