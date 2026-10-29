-- AlterTable
ALTER TABLE "mail_settings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "procurement_list_templates" ALTER COLUMN "id" SET DEFAULT 'singleton';

-- AlterTable
ALTER TABLE "request_item_quotes" ADD COLUMN     "discountRate" DOUBLE PRECISION DEFAULT 0;

-- AlterTable
ALTER TABLE "request_vendor_assignments" ADD COLUMN     "overallDiscountRate" DOUBLE PRECISION DEFAULT 0;
