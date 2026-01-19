-- AlterTable
ALTER TABLE "File" ADD COLUMN     "wrappedFileKey" TEXT;

-- CreateTable
CREATE TABLE "Share" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "contentType" TEXT,
    "createdBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "maxDownloads" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Share_shareId_key" ON "Share"("shareId");

-- CreateIndex
CREATE INDEX "Share_shareId_idx" ON "Share"("shareId");

-- CreateIndex
CREATE INDEX "Share_fileId_idx" ON "Share"("fileId");

-- CreateIndex
CREATE INDEX "Share_createdBy_idx" ON "Share"("createdBy");

-- CreateIndex
CREATE INDEX "Share_expiresAt_idx" ON "Share"("expiresAt");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
