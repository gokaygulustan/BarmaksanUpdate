ALTER TABLE "internal_requests" ADD COLUMN IF NOT EXISTS "neededBy" TIMESTAMP(3);
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "neededBy" TIMESTAMP(3);
