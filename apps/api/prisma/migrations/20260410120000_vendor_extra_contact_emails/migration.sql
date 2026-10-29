-- AlterTable
ALTER TABLE "vendors" ADD COLUMN "extraContactEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
