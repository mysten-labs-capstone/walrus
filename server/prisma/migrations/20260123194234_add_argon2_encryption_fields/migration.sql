-- AlterTable
ALTER TABLE "User" 
ADD COLUMN "authKeyHash" TEXT,
ADD COLUMN "salt" TEXT,
ADD COLUMN "encryptedMasterKey" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;
