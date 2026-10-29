-- CreateTable
CREATE TABLE "site_texts" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_texts_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "site_text_history" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "author" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_text_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "site_text_history_key_createdAt_idx" ON "site_text_history"("key", "createdAt");
