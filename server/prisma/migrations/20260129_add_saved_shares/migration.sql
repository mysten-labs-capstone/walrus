-- CreateTable SavedShare
CREATE TABLE "SavedShare" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "blobId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "contentType" TEXT,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByUsername" TEXT,
    "savedBy" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedShare_shareId_idx" ON "SavedShare"("shareId");

-- CreateIndex
CREATE INDEX "SavedShare_blobId_idx" ON "SavedShare"("blobId");

-- CreateIndex
CREATE INDEX "SavedShare_savedBy_idx" ON "SavedShare"("savedBy");

-- CreateIndex
CREATE INDEX "SavedShare_uploadedBy_idx" ON "SavedShare"("uploadedBy");

-- CreateIndex
CREATE INDEX "SavedShare_savedAt_idx" ON "SavedShare"("savedAt");
