/*
  Warnings:

  - You are about to drop the column `category` on the `request_items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "request_items" DROP COLUMN "category",
ADD COLUMN     "targetPrice" DOUBLE PRECISION;
