/*
  Warnings:

  - You are about to drop the column `savedBy` on the `SavedShare` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,shareId]` on the table `SavedShare` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `userId` to the `SavedShare` table without a default value. This is not possible if the table is not empty.
  - Made the column `uploadedByUsername` on table `SavedShare` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex (IF EXISTS so migration is safe if partially applied)
DROP INDEX IF EXISTS "SavedShare_blobId_idx";
DROP INDEX IF EXISTS "SavedShare_savedAt_idx";
DROP INDEX IF EXISTS "SavedShare_savedBy_idx";
DROP INDEX IF EXISTS "SavedShare_uploadedBy_idx";

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "starred" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SavedShare" DROP COLUMN "savedBy",
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "uploadedByUsername" SET NOT NULL;

-- CreateIndex
CREATE INDEX "SavedShare_userId_idx" ON "SavedShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedShare_userId_shareId_key" ON "SavedShare"("userId", "shareId");

-- AddForeignKey
ALTER TABLE "SavedShare" ADD CONSTRAINT "SavedShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
