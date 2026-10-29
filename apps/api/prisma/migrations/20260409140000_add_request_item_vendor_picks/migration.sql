-- CreateTable
CREATE TABLE "request_item_vendor_picks" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "chosenVendorId" TEXT,
    "pickedByUserId" TEXT NOT NULL,

    CONSTRAINT "request_item_vendor_picks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "request_item_vendor_picks_requestId_itemId_key" ON "request_item_vendor_picks"("requestId", "itemId");

-- AddForeignKey
ALTER TABLE "request_item_vendor_picks" ADD CONSTRAINT "request_item_vendor_picks_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item_vendor_picks" ADD CONSTRAINT "request_item_vendor_picks_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "request_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item_vendor_picks" ADD CONSTRAINT "request_item_vendor_picks_chosenVendorId_fkey" FOREIGN KEY ("chosenVendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_item_vendor_picks" ADD CONSTRAINT "request_item_vendor_picks_pickedByUserId_fkey" FOREIGN KEY ("pickedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
