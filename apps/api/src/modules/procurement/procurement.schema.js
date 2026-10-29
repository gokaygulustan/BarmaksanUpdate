import { z } from 'zod';

export const createRequestSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  deadline: z.string().datetime().optional(),
  vendorIds: z.array(z.string()).optional(),
  items: z.array(z.object({
    productId: z.string().optional(),
    serialNumber: z.string().max(250).regex(/^[0-9.,\-]*$/, 'SN yalnızca rakam, nokta, virgül veya tire içerebilir').optional().nullable(),
    stockCode: z.string().max(250).optional().nullable(),
    tonnageInfo: z.string().max(250).optional().nullable(),
    productName: z.string(),
    quantity: z.number().min(0),
    unit: z.string().trim().min(1).max(80).default("Adet"),
    secondaryQuantity: z.number().optional().nullable(),
    secondaryUnit: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    sortOrder: z.number().int().min(0).optional(),
  })).optional(),
  visibleColumns: z.array(z.string()).optional(),
  /** Tedarikçi teklif bildiriminde CC (yönetici adresleri); tedarikçi adresleriyle çakışanlar sunucuda elenir. */
  notificationCcEmails: z.array(z.string().email()).max(15).optional(),
  quoteCollectDays: z.number().int().min(1).max(120).optional(),
  quoteVatIncluded: z.boolean().nullable().optional(),
  quoteVatRate: z.number().min(0).max(100).nullable().optional(),
  quoteHasMaturity: z.boolean().nullable().optional(),
  quoteMaturityDays: z.number().int().min(0).max(365).nullable().optional(),
  shopDepartmentId: z.string().min(1).nullable().optional(),
  shopWorkerId: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  internalNote: z.string().max(5000).nullable().optional(),
  status: z.enum(['DRAFT', 'SENT_TO_VENDOR', 'VENDOR_QUOTED', 'VENDOR_APPROVED', 'IN_PRODUCTION', 'HAS_ISSUES', 'CANCELLED']).optional(),
});

export const updateRequestSchema = createRequestSchema.partial().extend({
  status: z
    .enum([
      'DRAFT',
      'SENT_TO_VENDOR',
      'VENDOR_QUOTED',
      'VENDOR_APPROVED',
      'IN_PRODUCTION',
      'HAS_ISSUES',
      'COMPLETED',
      'CANCELLED',
    ])
    .optional(),
  items: z.any().optional(),
});

export const assignVendorSchema = z.object({
  vendorId: z.string(),
  requestId: z.string(),
});

export const itemVendorPicksSchema = z.object({
  choices: z.array(
    z.object({
      itemId: z.string(),
      vendorId: z.string().nullable(),
    })
  ),
});

/** Karar daveti gövdesi — alıcılar yönetici CC + isteğe bağlı üst yönetim e-postası. */
export const decisionInviteBodySchema = z.object({
  extraEmails: z.array(z.string().email().max(320)).max(15).optional(),
  includeCanonical: z.boolean().optional(),
});

export const MARKET_CHANNELS = ['TRENDYOL', 'HEPSIBURADA', 'N11', 'AMAZON', 'OTHER'];
