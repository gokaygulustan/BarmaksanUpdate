-- AlterTable
ALTER TABLE "request_items" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Mevcut kayıtlar: SN sayısal ise ona göre, değilse oluşturulma sırasına göre
UPDATE "request_items" AS ri
SET "sortOrder" = sub.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "requestId"
      ORDER BY
        CASE
          WHEN "serialNumber" IS NOT NULL AND "serialNumber" ~ '^[0-9]+$'
          THEN CAST("serialNumber" AS INTEGER)
          ELSE 2147483647
        END,
        "createdAt" ASC,
        id ASC
    ) - 1 AS rn
  FROM "request_items"
) AS sub
WHERE ri.id = sub.id;
