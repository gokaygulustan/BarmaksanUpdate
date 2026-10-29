-- Onayda satın alma personeline atama + mesaj görüldü kayıtları

ALTER TABLE "internal_requests" ADD COLUMN IF NOT EXISTS "assignedToId" TEXT;

CREATE INDEX IF NOT EXISTS "internal_requests_assignedToId_idx"
  ON "internal_requests"("assignedToId");

DO $$ BEGIN
  ALTER TABLE "internal_requests"
    ADD CONSTRAINT "internal_requests_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "internal_request_message_reads" (
    "id" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "internal_request_message_reads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "internal_request_message_reads_messageId_userId_key"
  ON "internal_request_message_reads"("messageId", "userId");

CREATE INDEX IF NOT EXISTS "internal_request_message_reads_userId_idx"
  ON "internal_request_message_reads"("userId");

DO $$ BEGIN
  ALTER TABLE "internal_request_message_reads"
    ADD CONSTRAINT "internal_request_message_reads_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "internal_request_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "internal_request_message_reads"
    ADD CONSTRAINT "internal_request_message_reads_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
