-- AlterTable
ALTER TABLE "request_vendor_assignments" ADD COLUMN "quoteShortCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "request_vendor_assignments_quoteShortCode_key" ON "request_vendor_assignments"("quoteShortCode");
