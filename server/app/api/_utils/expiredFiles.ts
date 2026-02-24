import prisma from "./prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_EPOCHS = 53;

function getEpochDurationMs(): number {
  const network = (process.env.NETWORK?.toLowerCase() ?? "testnet") as
    | "testnet"
    | "mainnet";
  return (network === "mainnet" ? 14 : 1) * MS_PER_DAY;
}

async function backfillMissingExpiresAtForUser(userId: string): Promise<void> {
  const missingExpiryFiles = await prisma.file.findMany({
    where: {
      userId,
      expiresAt: null,
    },
    select: {
      id: true,
      uploadedAt: true,
      epochs: true,
    },
  });

  if (missingExpiryFiles.length === 0) {
    return;
  }

  const epochDurationMs = getEpochDurationMs();

  await prisma.$transaction(
    missingExpiryFiles.map((file) => {
      const rawEpochs = file.epochs ?? 3;
      const safeEpochs = Math.min(MAX_EPOCHS, Math.max(1, rawEpochs));
      const backfilledExpiresAt = new Date(
        file.uploadedAt.getTime() + safeEpochs * epochDurationMs,
      );

      return prisma.file.update({
        where: { id: file.id },
        data: { expiresAt: backfilledExpiresAt },
      });
    }),
  );
}

async function deleteFileIds(fileIds: string[]): Promise<number> {
  if (fileIds.length === 0) return 0;

  return prisma.$transaction(async (tx) => {
    const shares = await tx.share.findMany({
      where: { fileId: { in: fileIds } },
      select: { id: true },
    });

    const shareIds = shares.map((share) => share.id);
    if (shareIds.length > 0) {
      await tx.savedShare.deleteMany({
        where: { shareId: { in: shareIds } },
      });
    }

    const deleted = await tx.file.deleteMany({
      where: { id: { in: fileIds } },
    });

    return deleted.count;
  });
}

export async function purgeExpiredFilesForUser(userId: string): Promise<number> {
  await backfillMissingExpiresAtForUser(userId);

  const now = new Date();
  const expired = await prisma.file.findMany({
    where: {
      userId,
      expiresAt: { not: null, lte: now },
    },
    select: { id: true },
  });

  return deleteFileIds(expired.map((file) => file.id));
}

export async function purgeFileIfExpiredById(fileId: string): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, expiresAt: true },
  });

  if (!file?.expiresAt || file.expiresAt > new Date()) {
    return false;
  }

  await deleteFileIds([file.id]);
  return true;
}
