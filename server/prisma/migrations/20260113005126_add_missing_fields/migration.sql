-- AlterTable
ALTER TABLE "User" ADD COLUMN     "privateKey" TEXT;

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedUserId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "contentType" TEXT,
    "epochs" INTEGER NOT NULL DEFAULT 3,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "userKeyEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "masterKeyEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "cacheKey" TEXT,
    "cacheSize" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cachedAt" TIMESTAMP(3),

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "File_blobId_key" ON "File"("blobId");

-- CreateIndex
CREATE INDEX "File_userId_idx" ON "File"("userId");

-- CreateIndex
CREATE INDEX "File_blobId_idx" ON "File"("blobId");

-- CreateIndex
CREATE INDEX "File_encryptedUserId_idx" ON "File"("encryptedUserId");

-- CreateIndex
CREATE INDEX "File_uploadedAt_idx" ON "File"("uploadedAt");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
