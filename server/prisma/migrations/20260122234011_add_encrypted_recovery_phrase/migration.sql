/*
  Warnings:

  - You are about to drop the column `privateKey` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "User" DROP COLUMN "privateKey",
ADD COLUMN     "encryptedRecoveryPhrase" TEXT;
