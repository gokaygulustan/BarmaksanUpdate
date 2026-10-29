-- Idempotent: s羹tun / FK / indeks zaten varsa (manuel veya yar覺m migration) tekrar deploy patlamas覺n.

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "vendorId" TEXT;

ALTER TABLE "attachments" DROP CONSTRAINT IF EXISTS "attachments_vendorId_fkey";

ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_vendorId_fkey"
  FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "attachments_vendorId_idx" ON "attachments"("vendorId");
