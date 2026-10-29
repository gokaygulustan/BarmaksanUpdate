import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'PURCHASING', 'SUPPLIER']).default('PURCHASING'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
});

export const passwordResetSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  code: z.string().regex(/^\d{6}$/, '6 haneli kod girin'),
  password: z.string().min(8, 'Yeni şifre en az 8 karakter olmalıdır').max(80),
});

const companyEmail = z
  .string()
  .email('Geçerli bir e-posta girin')
  .refine((value) => String(value).trim().toLowerCase().endsWith('@ugurpromilling.com'), {
    message: 'Yalnızca @ugurpromilling.com e-postaları ile giriş yapılabilir.',
  });

export const otpRequestSchema = z.object({
  email: companyEmail,
});

export const otpVerifySchema = z.object({
  email: companyEmail,
  code: z.string().regex(/^\d{6}$/, '6 haneli kod girin'),
  name: z.string().min(2).max(80).optional(),
});

export const otpLinkSchema = z.object({
  token: z.string().min(20, 'Giriş bağlantısı geçersiz.'),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Ad soyad en az 2 karakter olmalıdır').max(80),
    phone: z
      .string()
      .trim()
      .max(8)
      .regex(/^\d{2,8}$/, 'Dahili numara 2-8 rakam olmalıdır')
      .nullable()
      .optional()
      .or(z.literal('')),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6, 'Yeni şifre en az 6 karakter olmalıdır').max(80).optional().or(z.literal('')),
  })
  .superRefine((data, ctx) => {
    if (data.newPassword && !String(data.currentPassword || '').trim()) {
      ctx.addIssue({
        code: 'custom',
        message: 'Şifreyi değiştirmek için mevcut şifrenizi girin.',
        path: ['currentPassword'],
      });
    }
  });
