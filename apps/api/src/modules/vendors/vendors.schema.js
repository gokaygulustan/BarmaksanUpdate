import { z } from 'zod';

export const createVendorSchema = z.object({
  name: z.string().min(2, 'Firma adı en az 2 karakter olmalıdır'),
  contactName: z.string().optional(),     // Yetkili Ad Soyad
  // Boş bırakılabilir: bazı tedarikçilere yalnızca SMS/telefonla ulaşılıyor
  contactEmail: z
    .union([z.string().email('Geçerli bir e-posta adresi giriniz'), z.literal('')])
    .optional()
    .default(''),
  extraContactEmails: z
    .array(z.string().email('Geçerli bir e-posta adresi giriniz'))
    .max(25)
    .optional()
    .default([]),
  contactPhone: z.string().optional(),
  extraContactPhones: z.array(z.string()).max(25).optional().default([]),
  taxId: z.string().optional(),
  city: z.string().optional(),            // Şehir
  district: z.string().optional(),        // İlçe
  address: z.string().optional(),
  // Ne sattığı: MOTOR, REDÜKTÖR, PASLANMAZ SAC … (arama ve filtre)
  categories: z.array(z.string()).max(60).optional().default([]),
  notes: z.string().max(2000).nullable().optional(),
  // Firmadaki yetkili kişiler — gönderilirse mevcut liste bununla eşitlenir
  contacts: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().max(160).nullable().optional(),
        title: z.string().max(120).nullable().optional(),
        email: z.string().max(160).nullable().optional(),
        phone: z.string().max(60).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
      }),
    )
    .max(40)
    .optional(),
  // Hangi modülün tedarikçisi — yalnızca ADMIN belirleyebilir, diğerleri kendi modülüne yazar
  moduleId: z.enum(['SATIN_ALMA', 'URETIM_PLANLAMA', 'YEDEK_PARCA']).optional(),
  userId: z.string().optional(),          // Link to a SUPPLIER user
});

export const updateVendorSchema = createVendorSchema.partial();
