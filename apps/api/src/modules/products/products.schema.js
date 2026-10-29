import { z } from 'zod';

export const createProductSchema = z.object({
  name: z.string().min(2, "Product name must be at least 2 characters"),
  description: z.string().optional(),
  category: z.string().optional(),
  unit: z.string().default("Adet"),
  vendorId: z.string().min(1, "Vendor ID is required")
});

export const updateProductSchema = createProductSchema.partial();
