import { z } from 'zod';

export const createContactSchema = z.object({
  name: z.string().min(1, 'İsim gerekli').max(120),
  email: z.string().email('Geçerli e-posta giriniz').max(250),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const updateContactSchema = createContactSchema.partial();
