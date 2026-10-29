CREATE TABLE IF NOT EXISTS "invoice_items" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attachmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoice_items_attachmentId_itemId_key" ON "invoice_items"("attachmentId", "itemId");
CREATE INDEX IF NOT EXISTS "invoice_items_itemId_idx" ON "invoice_items"("itemId");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_attachmentId_fkey"
  FOREIGN KEY ("attachmentId") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "request_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Kalem seçimi öncesi yüklenen faturalar talebin tüm kalemlerini kapsar.
INSERT INTO "invoice_items" ("id", "attachmentId", "itemId")
SELECT 'inv_' || md5(a."id" || ':' || ri."id"), a."id", ri."id"
FROM "attachments" a
JOIN "request_items" ri ON ri."requestId" = a."requestId"
WHERE a."kind" = 'INVOICE'
ON CONFLICT ("attachmentId", "itemId") DO NOTHING;
