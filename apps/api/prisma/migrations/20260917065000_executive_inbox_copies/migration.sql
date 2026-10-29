ALTER TABLE "procurement_decision_invites" ADD COLUMN IF NOT EXISTS "extraEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "executive_inbox_copies" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "executive_inbox_copies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "executive_inbox_copies_requestId_email_key" ON "executive_inbox_copies"("requestId", "email");
CREATE INDEX IF NOT EXISTS "executive_inbox_copies_email_idx" ON "executive_inbox_copies"("email");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'executive_inbox_copies_requestId_fkey'
  ) THEN
    ALTER TABLE "executive_inbox_copies"
      ADD CONSTRAINT "executive_inbox_copies_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
