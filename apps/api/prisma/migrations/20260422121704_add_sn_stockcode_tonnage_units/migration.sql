-- AlterTable
ALTER TABLE "request_items" ADD COLUMN     "serialNumber" VARCHAR(250),
ADD COLUMN     "stockCode" VARCHAR(250),
ADD COLUMN     "tonnageInfo" VARCHAR(250);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "units_name_key" ON "units"("name");
