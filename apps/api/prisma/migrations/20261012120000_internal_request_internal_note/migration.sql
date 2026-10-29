ALTER TABLE "internal_requests" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;

-- Önceden iç not açıklamaya "\n\nİç not: …" olarak gömülüyordu; ayır.
UPDATE "internal_requests"
SET "internalNote" = btrim(substr("description", strpos("description", E'\n\nİç not: ') + 10)),
    "description" = NULLIF(btrim(left("description", strpos("description", E'\n\nİç not: ') - 1)), '')
WHERE "internalNote" IS NULL
  AND strpos("description", E'\n\nİç not: ') > 0;

UPDATE "internal_requests"
SET "internalNote" = btrim(substr("description", 9)),
    "description" = NULL
WHERE "internalNote" IS NULL
  AND "description" LIKE 'İç not: %';

-- Dönüştürülmüş RFQ'larda boşluklar tek boşluğa indirildiği için " İç not: " olarak kaldı.
UPDATE "procurement_requests" p
SET "internalNote" = btrim(substr(p."description", strpos(p."description", ' İç not: ') + 9)),
    "description" = NULLIF(btrim(left(p."description", strpos(p."description", ' İç not: ') - 1)), '')
FROM "internal_requests" ir
WHERE ir."procurementRequestId" = p."id"
  AND p."internalNote" IS NULL
  AND strpos(p."description", ' İç not: ') > 0;

UPDATE "procurement_requests" p
SET "internalNote" = btrim(substr(p."description", 9)),
    "description" = NULL
FROM "internal_requests" ir
WHERE ir."procurementRequestId" = p."id"
  AND p."internalNote" IS NULL
  AND p."description" LIKE 'İç not: %';
