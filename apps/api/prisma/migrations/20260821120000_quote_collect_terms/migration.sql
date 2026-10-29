-- AlterTable
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "quoteVatIncluded" BOOLEAN;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "quoteVatRate" DOUBLE PRECISION;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "quoteHasMaturity" BOOLEAN;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "quoteMaturityDays" INTEGER;
