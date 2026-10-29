-- Birim talebi içinde satın alma ile canlı yazışma

CREATE TABLE IF NOT EXISTS "internal_request_messages" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "internal_request_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "internal_request_messages_requestId_createdAt_idx"
  ON "internal_request_messages"("requestId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "internal_request_messages"
    ADD CONSTRAINT "internal_request_messages_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "internal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "internal_request_messages"
    ADD CONSTRAINT "internal_request_messages_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
