-- Kalem / cari kapsamlı medya ekleri
ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "itemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attachments_itemId_fkey'
  ) THEN
    ALTER TABLE "attachments"
      ADD CONSTRAINT "attachments_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "request_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "attachments_itemId_idx" ON "attachments"("itemId");
