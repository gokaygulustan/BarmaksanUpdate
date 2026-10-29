-- Birim talebi birden çok tedarik talebine bölünebilsin.
-- Eski 1:1 bağ (internal_requests.procurementRequestId) tedarik talebinin tarafına taşınır.
-- Kalem, hangi tedarik talebine alındığını tutar.

ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "internalRequestId" TEXT;

UPDATE "procurement_requests" AS pr
SET "internalRequestId" = ir."id"
FROM "internal_requests" AS ir
WHERE ir."procurementRequestId" = pr."id"
  AND pr."internalRequestId" IS NULL;

CREATE INDEX IF NOT EXISTS "procurement_requests_internalRequestId_idx"
  ON "procurement_requests"("internalRequestId");

ALTER TABLE "procurement_requests" DROP CONSTRAINT IF EXISTS "procurement_requests_internalRequestId_fkey";
ALTER TABLE "procurement_requests"
  ADD CONSTRAINT "procurement_requests_internalRequestId_fkey"
  FOREIGN KEY ("internalRequestId") REFERENCES "internal_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_request_items" ADD COLUMN IF NOT EXISTS "procurementRequestId" TEXT;

UPDATE "internal_request_items" AS it
SET "procurementRequestId" = ir."procurementRequestId"
FROM "internal_requests" AS ir
WHERE it."requestId" = ir."id"
  AND ir."procurementRequestId" IS NOT NULL
  AND it."procurementRequestId" IS NULL;

CREATE INDEX IF NOT EXISTS "internal_request_items_procurementRequestId_idx"
  ON "internal_request_items"("procurementRequestId");

ALTER TABLE "internal_request_items" DROP CONSTRAINT IF EXISTS "internal_request_items_procurementRequestId_fkey";
ALTER TABLE "internal_request_items"
  ADD CONSTRAINT "internal_request_items_procurementRequestId_fkey"
  FOREIGN KEY ("procurementRequestId") REFERENCES "procurement_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_requests" DROP CONSTRAINT IF EXISTS "internal_requests_procurementRequestId_fkey";
DROP INDEX IF EXISTS "internal_requests_procurementRequestId_key";
ALTER TABLE "internal_requests" DROP COLUMN IF EXISTS "procurementRequestId";
