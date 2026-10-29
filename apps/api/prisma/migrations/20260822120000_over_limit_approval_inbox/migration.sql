-- Limit aşımı üst yönetim e-postası + günlük onay kutusu jetonu
ALTER TABLE "procurement_approval_limits" ADD COLUMN IF NOT EXISTS "executiveEmail" TEXT;

CREATE TABLE IF NOT EXISTS "over_limit_approval_tokens" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "dayKey" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "over_limit_approval_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "over_limit_approval_tokens_token_key" ON "over_limit_approval_tokens"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "over_limit_approval_tokens_email_dayKey_key" ON "over_limit_approval_tokens"("email", "dayKey");
CREATE INDEX IF NOT EXISTS "over_limit_approval_tokens_token_idx" ON "over_limit_approval_tokens"("token");

-- Link ile onayda actorUserId boş olabilir
ALTER TABLE "procurement_approval_histories" ALTER COLUMN "actorUserId" DROP NOT NULL;
