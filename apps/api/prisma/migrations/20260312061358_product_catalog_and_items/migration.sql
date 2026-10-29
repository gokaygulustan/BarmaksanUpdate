/*
  Warnings:

  - The values [OPEN,IN_REVIEW,AWARDED] on the enum `RequestStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('DRAFT', 'SENT_TO_VENDOR', 'VENDOR_APPROVED', 'IN_PRODUCTION', 'HAS_ISSUES', 'COMPLETED', 'CANCELLED');
ALTER TABLE "procurement_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "procurement_requests" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "RequestStatus_old";
ALTER TABLE "procurement_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "price" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_items" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "notes" TEXT,
    "hasIssue" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT NOT NULL,
    "productId" TEXT,

    CONSTRAINT "request_items_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
