-- CreateTable
CREATE TABLE "mail_outbox" (
    "id" TEXT NOT NULL,
    "channel" TEXT,
    "status" TEXT NOT NULL,
    "skipReason" TEXT,
    "to" TEXT NOT NULL,
    "cc" TEXT,
    "bcc" TEXT,
    "subject" TEXT NOT NULL,
    "htmlBody" TEXT,
    "textBody" TEXT,
    "plainSnippet" TEXT,
    "messageId" TEXT,
    "errorMessage" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_outbox_createdAt_idx" ON "mail_outbox"("createdAt");

-- CreateIndex
CREATE INDEX "mail_outbox_status_idx" ON "mail_outbox"("status");

-- CreateIndex
CREATE INDEX "mail_outbox_channel_idx" ON "mail_outbox"("channel");
