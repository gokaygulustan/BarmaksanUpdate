import { z } from 'zod';

/** Depo Sorumlusu portala giriş yapmaz; şifre zorunlu değildir. */
const passwordRequiredUnlessWarehouse = (data) =>
  data.subRole === 'WAREHOUSE' || (typeof data.password === 'string' && data.password.length >= 6);

export const createUserSchema = z
  .object({
    name: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır'),
    email: z.string().email('Geçerli bir e-posta adresi giriniz'),
    password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır').optional(),
    role: z.enum(['ADMIN', 'PURCHASING', 'SUPPLIER']).default('PURCHASING'),
    moduleId: z.string().optional(),
    subRole: z.enum(['MANAGER', 'STAFF', 'DIRECTOR', 'WAREHOUSE']).optional(),
    isExecutive: z.boolean().optional(),
    phone: z.string().optional().nullable(),
    vendorName: z.string().optional(),
  })
  .refine(passwordRequiredUnlessWarehouse, {
    message: 'Şifre en az 6 karakter olmalıdır',
    path: ['password'],
  });

export const updateUserSchema = z.object({
  name: z.string().min(2, 'Ad Soyad en az 2 karakter olmalıdır').optional(),
  email: z.string().email('Geçerli bir e-posta adresi giriniz').optional(),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalıdır').optional(),
  role: z.enum(['ADMIN', 'PURCHASING', 'SUPPLIER', 'DEPARTMENT']).optional(),
  moduleId: z.string().optional(),
  subRole: z.enum(['MANAGER', 'STAFF', 'DIRECTOR', 'WAREHOUSE']).optional(),
  isExecutive: z.boolean().optional(),
  phone: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  vendorId: z.string().optional(),
});
