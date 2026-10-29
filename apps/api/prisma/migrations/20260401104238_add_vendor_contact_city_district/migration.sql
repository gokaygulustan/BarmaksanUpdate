/*
  Warnings:

  - You are about to drop the column `price` on the `products` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'VENDOR_QUOTED';

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "targetVendorId" TEXT;

-- AlterTable
ALTER TABLE "products" DROP COLUMN "price";

-- AlterTable
ALTER TABLE "request_items" ADD COLUMN     "category" TEXT,
ADD COLUMN     "secondaryQuantity" DOUBLE PRECISION,
ADD COLUMN     "secondaryUnit" TEXT,
ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "city" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "district" TEXT;

-- CreateTable
CREATE TABLE "vendor_catalogs" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "vendor_catalogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_item_quotes" (
    "id" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "itemId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,

    CONSTRAINT "request_item_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_item_quotes_itemId_vendorId_key" ON "request_item_quotes"("itemId", "vendorId");

-- AddForeignKey
ALTER TABLE "vendor_catalogs" ADD CONSTRAINT "vendor_catalogs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item_quotes" ADD CONSTRAINT "request_item_quotes_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "request_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item_quotes" ADD CONSTRAINT "request_item_quotes_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_targetVendorId_fkey" FOREIGN KEY ("targetVendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
