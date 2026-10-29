-- Birim portalı: DEPARTMENT rolü, e-posta OTP, iç talep ekleri

DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEPARTMENT';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "internal_requests" ADD COLUMN IF NOT EXISTS "requesterUnit" TEXT;
ALTER TABLE "internal_requests" ALTER COLUMN "moduleId" SET DEFAULT 'SATIN_ALMA';
UPDATE "internal_requests" SET "moduleId" = 'SATIN_ALMA' WHERE "moduleId" IS NULL OR "moduleId" = 'URETIM_PLANLAMA';

CREATE TABLE IF NOT EXISTS "internal_request_attachments" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "internal_request_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "internal_request_attachments_requestId_idx" ON "internal_request_attachments"("requestId");

DO $$ BEGIN
  ALTER TABLE "internal_request_attachments"
    ADD CONSTRAINT "internal_request_attachments_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "internal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "email_otps" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_otps_email_createdAt_idx" ON "email_otps"("email", "createdAt");
