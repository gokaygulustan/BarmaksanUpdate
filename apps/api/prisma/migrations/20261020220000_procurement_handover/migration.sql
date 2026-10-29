ALTER TABLE "procurement_requests" ADD COLUMN "purchasingResponsibleModuleId" TEXT;

CREATE TABLE "procurement_handovers" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromModuleId" TEXT NOT NULL,
    "toModuleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_handovers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "procurement_handovers_requestId_createdAt_idx" ON "procurement_handovers"("requestId", "createdAt");

CREATE UNIQUE INDEX "procurement_handovers_one_pending_request"
ON "procurement_handovers"("requestId")
WHERE "status" = 'PENDING';

ALTER TABLE "procurement_handovers"
ADD CONSTRAINT "procurement_handovers_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "procurement_handovers"
ADD CONSTRAINT "procurement_handovers_initiatedById_fkey"
FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "procurement_handovers"
ADD CONSTRAINT "procurement_handovers_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
