import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { prisma } from './src/lib/prisma.js';

const u = await prisma.user.findFirst({
  where: { role: 'ADMIN' },
  select: { id: true, email: true, role: true },
});
console.log('admin', u);

const token = jwt.sign(
  { id: u.id, email: u.email, role: u.role, name: 'Admin', moduleId: 'URETIM_PLANLAMA', subRole: 'STAFF', portal: 'staff' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const res = await fetch('http://localhost:4000/api/mail-outbox/seed-previews', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
});
const text = await res.text();
console.log('status', res.status);
console.log(text.slice(0, 3000));
await prisma.$disconnect();
