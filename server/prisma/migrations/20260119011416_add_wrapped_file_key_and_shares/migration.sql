/*
  Warnings:

  - You are about to drop the column `contentType` on the `Share` table. All the data in the column will be lost.
  - You are about to drop the column `filename` on the `Share` table. All the data in the column will be lost.
  - You are about to drop the column `lastAccessedAt` on the `Share` table. All the data in the column will be lost.
  - You are about to drop the column `originalSize` on the `Share` table. All the data in the column will be lost.
  - You are about to drop the column `shareId` on the `Share` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Share_expiresAt_idx";

-- DropIndex
DROP INDEX "Share_shareId_idx";

-- DropIndex
DROP INDEX "Share_shareId_key";

-- AlterTable
ALTER TABLE "Share" DROP COLUMN "contentType",
DROP COLUMN "filename",
DROP COLUMN "lastAccessedAt",
DROP COLUMN "originalSize",
DROP COLUMN "shareId";

-- CreateIndex
CREATE INDEX "Share_blobId_idx" ON "Share"("blobId");

-- CreateIndex
CREATE INDEX "Share_createdAt_idx" ON "Share"("createdAt");
