-- CreateTable
CREATE TABLE "procurement_list_templates" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    "size" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procurement_list_templates_pkey" PRIMARY KEY ("id")
);
