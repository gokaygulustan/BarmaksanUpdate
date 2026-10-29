-- AlterTable
ALTER TABLE "request_item_vendor_picks" ADD COLUMN "chosenMarketSourceId" TEXT;

-- CreateIndex
CREATE INDEX "request_item_vendor_picks_chosenMarketSourceId_idx" ON "request_item_vendor_picks"("chosenMarketSourceId");

-- AddForeignKey
ALTER TABLE "request_item_vendor_picks" ADD CONSTRAINT "request_item_vendor_picks_chosenMarketSourceId_fkey" FOREIGN KEY ("chosenMarketSourceId") REFERENCES "request_market_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
