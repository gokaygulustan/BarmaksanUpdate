-- Cari bazlı nakliye bedeli (Ankara / İstanbul aynı ortalamayı paylaşmasın).
ALTER TABLE "request_vendor_assignments" ADD COLUMN IF NOT EXISTS "shippingCostTRY" DOUBLE PRECISION;
