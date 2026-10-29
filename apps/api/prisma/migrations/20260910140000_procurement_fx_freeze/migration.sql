-- COMPLETED taleplerde çapraz kur kilidi (TRY ana toplam)
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "fxRatesJson" JSONB;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "fxSource" TEXT;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "fxFetchedAt" TIMESTAMP(3);
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "fxFrozenAt" TIMESTAMP(3);
