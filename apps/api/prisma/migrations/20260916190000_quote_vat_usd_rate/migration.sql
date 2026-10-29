ALTER TABLE "request_item_quotes" ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION;

ALTER TABLE "request_vendor_assignments" ADD COLUMN IF NOT EXISTS "usdRateFixed" BOOLEAN DEFAULT false;
ALTER TABLE "request_vendor_assignments" ADD COLUMN IF NOT EXISTS "usdRate" DOUBLE PRECISION;
