import { z } from 'zod';

const itemSchema = z.object({
  id: z.string().min(1).optional().nullable(),
  productName: z.string().min(1),
  quantity: z.number().min(0),
  unit: z.string().trim().min(1).max(80).default('Adet'),
  notes: z.string().optional().nullable(),
  stockCode: z.string().max(250).optional().nullable(),
});

const neededBySchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    if (v == null || v === '') return null;
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    }
    const dt = new Date(s);
    return Number.isNaN(dt.getTime()) ? null : dt;
  });

export const createInternalRequestSchema = z.object({
  title: z.string().min(3, 'Başlık en az 3 karakter olmalı'),
  description: z.string().optional().nullable(),
  internalNote: z.string().max(5000).optional().nullable(),
  requesterUnit: z.string().max(200).optional().nullable(),
  shopDepartmentId: z.string().min(1).nullable().optional(),
  shopWorkerId: z.string().min(1).nullable().optional(),
  neededBy: neededBySchema,
  items: z.array(itemSchema).optional().default([]),
});

export const updateInternalRequestSchema = createInternalRequestSchema.partial();

export const reviewInternalRequestSchema = z.object({
  note: z.string().optional().nullable(),
  assignedToId: z.string().min(1).optional(),
  assignedToIds: z.array(z.string().min(1)).min(1).optional(),
});

export const chatMessageSchema = z.object({
  body: z.string().max(8000, 'Mesaj en fazla 8000 karakter olabilir').optional().default(''),
});
