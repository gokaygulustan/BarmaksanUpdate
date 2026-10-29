-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isExecutive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;

UPDATE "users" SET "isExecutive" = true WHERE "role" = 'ADMIN';

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "flaggedInternalOverlap" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditSeverity" AS ENUM ('INFO', 'ALERT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "InternalRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "internal_requests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "InternalRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "moduleId" TEXT NOT NULL DEFAULT 'URETIM_PLANLAMA',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "procurementRequestId" TEXT,

    CONSTRAINT "internal_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "internal_requests_procurementRequestId_key" ON "internal_requests"("procurementRequestId");
CREATE INDEX IF NOT EXISTS "internal_requests_status_moduleId_idx" ON "internal_requests"("status", "moduleId");

CREATE TABLE IF NOT EXISTS "internal_request_items" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "notes" TEXT,
    "stockCode" VARCHAR(250),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "internal_request_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "audit_events" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'INFO',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "requestId" TEXT,
    "vendorId" TEXT,
    "internalRequestId" TEXT,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_events_severity_createdAt_idx" ON "audit_events"("severity", "createdAt");
CREATE INDEX IF NOT EXISTS "audit_events_actorUserId_idx" ON "audit_events"("actorUserId");

CREATE TABLE IF NOT EXISTS "product_price_snapshots" (
    "id" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "stockCode" TEXT,
    "vendorName" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "unit" TEXT,
    "quantity" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'COMPLETED',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "itemId" TEXT,
    "vendorId" TEXT,

    CONSTRAINT "product_price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_price_snapshots_productName_recordedAt_idx" ON "product_price_snapshots"("productName", "recordedAt");
CREATE INDEX IF NOT EXISTS "product_price_snapshots_stockCode_idx" ON "product_price_snapshots"("stockCode");

CREATE TABLE IF NOT EXISTS "sms_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "usercode" TEXT,
    "password" TEXT,
    "msgheader" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_settings_pkey" PRIMARY KEY ("id")
);

-- FKs
ALTER TABLE "internal_requests" DROP CONSTRAINT IF EXISTS "internal_requests_createdById_fkey";
ALTER TABLE "internal_requests" ADD CONSTRAINT "internal_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "internal_requests" DROP CONSTRAINT IF EXISTS "internal_requests_reviewedById_fkey";
ALTER TABLE "internal_requests" ADD CONSTRAINT "internal_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_requests" DROP CONSTRAINT IF EXISTS "internal_requests_procurementRequestId_fkey";
ALTER TABLE "internal_requests" ADD CONSTRAINT "internal_requests_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "procurement_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "internal_request_items" DROP CONSTRAINT IF EXISTS "internal_request_items_requestId_fkey";
ALTER TABLE "internal_request_items" ADD CONSTRAINT "internal_request_items_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "internal_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_actorUserId_fkey";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_requestId_fkey";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_vendorId_fkey";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_internalRequestId_fkey";
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_internalRequestId_fkey" FOREIGN KEY ("internalRequestId") REFERENCES "internal_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_price_snapshots" DROP CONSTRAINT IF EXISTS "product_price_snapshots_requestId_fkey";
ALTER TABLE "product_price_snapshots" ADD CONSTRAINT "product_price_snapshots_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_price_snapshots" DROP CONSTRAINT IF EXISTS "product_price_snapshots_vendorId_fkey";
ALTER TABLE "product_price_snapshots" ADD CONSTRAINT "product_price_snapshots_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
