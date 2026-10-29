-- CreateTable
CREATE TABLE "procurement_decision_invites" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "procurement_decision_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "procurement_decision_invites_token_key" ON "procurement_decision_invites"("token");

-- CreateIndex
CREATE INDEX "procurement_decision_invites_requestId_idx" ON "procurement_decision_invites"("requestId");

-- AddForeignKey
ALTER TABLE "procurement_decision_invites" ADD CONSTRAINT "procurement_decision_invites_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "procurement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procurement_decision_invites" ADD CONSTRAINT "procurement_decision_invites_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
