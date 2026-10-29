-- Birim talebi: mavi/beyaz yaka birim + usta. SATIN_ALMA RFQ'ları panoya bağlanır.
ALTER TABLE "internal_requests" ADD COLUMN IF NOT EXISTS "shopDepartmentId" TEXT;
ALTER TABLE "internal_requests" ADD COLUMN IF NOT EXISTS "shopWorkerId" TEXT;

CREATE INDEX IF NOT EXISTS "internal_requests_shopDepartmentId_idx" ON "internal_requests"("shopDepartmentId");
CREATE INDEX IF NOT EXISTS "internal_requests_shopWorkerId_idx" ON "internal_requests"("shopWorkerId");

DO $$ BEGIN
  ALTER TABLE "internal_requests"
    ADD CONSTRAINT "internal_requests_shopDepartmentId_fkey"
    FOREIGN KEY ("shopDepartmentId") REFERENCES "org_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "internal_requests"
    ADD CONSTRAINT "internal_requests_shopWorkerId_fkey"
    FOREIGN KEY ("shopWorkerId") REFERENCES "org_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Mevcut satın alma RFQ'ları (sprey boya vb.) birim tedarik panosunda görünsün.
INSERT INTO "internal_requests" (
  "id",
  "title",
  "description",
  "requesterUnit",
  "shopDepartmentId",
  "shopWorkerId",
  "status",
  "moduleId",
  "neededBy",
  "createdAt",
  "updatedAt",
  "createdById",
  "procurementRequestId"
)
SELECT
  'ir_' || left(md5(pr.id), 22),
  pr.title,
  pr.description,
  d.name,
  pr."shopDepartmentId",
  pr."shopWorkerId",
  'CONVERTED'::"InternalRequestStatus",
  'SATIN_ALMA',
  pr."neededBy",
  pr."createdAt",
  CURRENT_TIMESTAMP,
  pr."createdById",
  pr.id
FROM "procurement_requests" pr
LEFT JOIN "org_departments" d ON d.id = pr."shopDepartmentId"
WHERE pr."moduleId" = 'SATIN_ALMA'
  AND NOT EXISTS (
    SELECT 1 FROM "internal_requests" ir WHERE ir."procurementRequestId" = pr.id
  );

INSERT INTO "internal_request_items" (
  "id",
  "productName",
  "quantity",
  "unit",
  "notes",
  "stockCode",
  "sortOrder",
  "requestId"
)
SELECT
  'ii_' || left(md5(ri.id), 22),
  ri."productName",
  ri.quantity,
  COALESCE(NULLIF(ri.unit, ''), 'Adet'),
  ri.notes,
  ri."stockCode",
  COALESCE(ri."sortOrder", 0),
  ir.id
FROM "request_items" ri
JOIN "internal_requests" ir ON ir."procurementRequestId" = ri."requestId"
WHERE NOT EXISTS (
  SELECT 1 FROM "internal_request_items" x WHERE x."requestId" = ir.id AND x."productName" = ri."productName" AND x."sortOrder" = COALESCE(ri."sortOrder", 0)
);
