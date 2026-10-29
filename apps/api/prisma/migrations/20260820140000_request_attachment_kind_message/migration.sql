-- Mesaj/talep ekleri: belge vs yapıştırılan görsel

ALTER TABLE "internal_request_attachments" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'FILE';
ALTER TABLE "internal_request_attachments" ADD COLUMN IF NOT EXISTS "messageId" TEXT;

CREATE INDEX IF NOT EXISTS "internal_request_attachments_messageId_idx"
  ON "internal_request_attachments"("messageId");

DO $$ BEGIN
  ALTER TABLE "internal_request_attachments"
    ADD CONSTRAINT "internal_request_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "internal_request_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
