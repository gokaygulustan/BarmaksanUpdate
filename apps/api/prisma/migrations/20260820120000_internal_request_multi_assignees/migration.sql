-- Birim talebine birden fazla satın alma personeli

CREATE TABLE IF NOT EXISTS "internal_request_assignees" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "internal_request_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "internal_request_assignees_requestId_userId_key"
  ON "internal_request_assignees"("requestId", "userId");

CREATE INDEX IF NOT EXISTS "internal_request_assignees_userId_idx"
  ON "internal_request_assignees"("userId");

DO $$ BEGIN
  ALTER TABLE "internal_request_assignees"
    ADD CONSTRAINT "internal_request_assignees_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "internal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "internal_request_assignees"
    ADD CONSTRAINT "internal_request_assignees_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

INSERT INTO "internal_request_assignees" ("id", "requestId", "userId")
SELECT 'mig_' || "id", "id", "assignedToId"
FROM "internal_requests"
WHERE "assignedToId" IS NOT NULL
ON CONFLICT ("requestId", "userId") DO NOTHING;
