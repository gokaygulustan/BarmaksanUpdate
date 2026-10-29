-- Birim talebi kalem fotoğrafları
ALTER TABLE "internal_request_attachments" ADD COLUMN IF NOT EXISTS "itemId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_request_attachments_itemId_fkey'
  ) THEN
    ALTER TABLE "internal_request_attachments"
      ADD CONSTRAINT "internal_request_attachments_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "internal_request_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "internal_request_attachments_itemId_idx"
  ON "internal_request_attachments"("itemId");
