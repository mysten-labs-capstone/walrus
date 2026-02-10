-- Add fileId column to File table if it doesn't exist

ALTER TABLE "File" ADD COLUMN "fileId" TEXT UNIQUE;

-- Create index on fileId
CREATE INDEX IF NOT EXISTS "File_fileId_idx" ON "File"("fileId");
