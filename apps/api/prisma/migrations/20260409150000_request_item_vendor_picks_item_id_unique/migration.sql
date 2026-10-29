-- Bire-bir ilişki için itemId benzersiz olmalı (Prisma P1012).
CREATE UNIQUE INDEX "request_item_vendor_picks_itemId_key" ON "request_item_vendor_picks"("itemId");
