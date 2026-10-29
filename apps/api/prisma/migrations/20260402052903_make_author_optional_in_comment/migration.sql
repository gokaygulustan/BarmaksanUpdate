/*
  Warnings:

  - A unique constraint covering the columns `[quoteToken]` on the table `request_vendor_assignments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "comments" DROP CONSTRAINT "comments_authorId_fkey";

-- AlterTable
ALTER TABLE "comments" ALTER COLUMN "authorId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "request_vendor_assignments" ADD COLUMN     "quoteToken" TEXT,
ADD COLUMN     "tokenExpires" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "vendor_activity_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "vendor_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_vendor_assignments_quoteToken_key" ON "request_vendor_assignments"("quoteToken");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_activity_logs" ADD CONSTRAINT "vendor_activity_logs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_activity_logs" ADD CONSTRAINT "vendor_activity_logs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
