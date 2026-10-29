-- Satın alma fatura takibi
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "invoiceUploadedAt" TIMESTAMP(3);

ALTER TABLE "attachments" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'GENERAL';

CREATE INDEX IF NOT EXISTS "attachments_requestId_kind_idx" ON "attachments"("requestId", "kind");
