-- Varsayılan: KDV dahil değil; oran %20
ALTER TABLE "request_vendor_assignments" ALTER COLUMN "isVatIncluded" SET DEFAULT false;
ALTER TABLE "request_vendor_assignments" ALTER COLUMN "vatRate" SET DEFAULT 20;
