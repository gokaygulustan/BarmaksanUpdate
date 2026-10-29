-- CreateEnum
CREATE TYPE "DepartmentCollarType" AS ENUM ('WHITE_COLLAR', 'BLUE_COLLAR');

-- AlterTable org_departments
ALTER TABLE "org_departments" ADD COLUMN IF NOT EXISTS "collarType" "DepartmentCollarType" NOT NULL DEFAULT 'WHITE_COLLAR';
ALTER TABLE "org_departments" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable org_workers
CREATE TABLE IF NOT EXISTS "org_workers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "departmentId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_workers_pkey" PRIMARY KEY ("id")
);

-- AlterTable procurement_requests
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "shopDepartmentId" TEXT;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "shopWorkerId" TEXT;
ALTER TABLE "procurement_requests" ADD COLUMN IF NOT EXISTS "internalNote" TEXT;

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "org_workers" ADD CONSTRAINT "org_workers_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES "org_departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_shopDepartmentId_fkey"
    FOREIGN KEY ("shopDepartmentId") REFERENCES "org_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "procurement_requests" ADD CONSTRAINT "procurement_requests_shopWorkerId_fkey"
    FOREIGN KEY ("shopWorkerId") REFERENCES "org_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "org_departments_collarType_isActive_idx" ON "org_departments"("collarType", "isActive");
CREATE INDEX IF NOT EXISTS "org_workers_departmentId_isActive_idx" ON "org_workers"("departmentId", "isActive");
CREATE INDEX IF NOT EXISTS "org_workers_lastName_firstName_idx" ON "org_workers"("lastName", "firstName");
CREATE INDEX IF NOT EXISTS "procurement_requests_shopDepartmentId_idx" ON "procurement_requests"("shopDepartmentId");
CREATE INDEX IF NOT EXISTS "procurement_requests_shopWorkerId_idx" ON "procurement_requests"("shopWorkerId");
