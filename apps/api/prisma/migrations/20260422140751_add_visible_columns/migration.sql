-- AlterTable
ALTER TABLE "procurement_requests" ADD COLUMN     "visibleColumns" TEXT[] DEFAULT ARRAY['productName', 'quantity', 'unit']::TEXT[];
