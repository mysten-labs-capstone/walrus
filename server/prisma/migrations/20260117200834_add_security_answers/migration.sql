-- AlterTable
ALTER TABLE "File" ADD COLUMN     "s3Key" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateTable
CREATE TABLE "SecurityAnswer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answerHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityAnswer_userId_idx" ON "SecurityAnswer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecoveryToken_token_key" ON "RecoveryToken"("token");

-- CreateIndex
CREATE INDEX "RecoveryToken_userId_idx" ON "RecoveryToken"("userId");

-- AddForeignKey
ALTER TABLE "SecurityAnswer" ADD CONSTRAINT "SecurityAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryToken" ADD CONSTRAINT "RecoveryToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
