import prisma from "./prisma";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_EPOCHS = 53;

function getEpochDurationMs(): number {
  const network = (process.env.NETWORK?.toLowerCase() ?? "testnet") as
    | "testnet"
    | "mainnet";
  return (network === "mainnet" ? 14 : 1) * MS_PER_DAY;
}

function deriveExpiresAt(uploadedAt: Date, epochs: number | null): Date {
  const rawEpochs = epochs ?? 3;
  const safeEpochs = Math.min(MAX_EPOCHS, Math.max(1, rawEpochs));
  return new Date(uploadedAt.getTime() + safeEpochs * getEpochDurationMs());
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

  for (const file of missingExpiryFiles) {
    try {
      const backfilledExpiresAt = deriveExpiresAt(file.uploadedAt, file.epochs);
      await prisma.file.update({
        where: { id: file.id },
        data: { expiresAt: backfilledExpiresAt },
      });
    } catch (err) {
      console.warn("[expiredFiles] Failed to backfill expiresAt", {
        fileId: file.id,
      });
    }
  }
}

async function purgeLegacyExpiredWithoutExpiresAt(userId: string): Promise<number> {
  const now = new Date();
  const filesMissingExpiry = await prisma.file.findMany({
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

  const expiredIds = filesMissingExpiry
    .filter((file) => deriveExpiresAt(file.uploadedAt, file.epochs) <= now)
    .map((file) => file.id);

  return deleteFileIds(expiredIds);
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
  const purgedLegacy = await purgeLegacyExpiredWithoutExpiresAt(userId);

  await backfillMissingExpiresAtForUser(userId);

  const now = new Date();
  const expired = await prisma.file.findMany({
    where: {
      userId,
      expiresAt: { not: null, lte: now },
    },
    select: { id: true },
  });

  const purgedStandard = await deleteFileIds(expired.map((file) => file.id));
  return purgedLegacy + purgedStandard;
}

export async function purgeFileIfExpiredById(fileId: string): Promise<boolean> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, expiresAt: true, uploadedAt: true, epochs: true },
  });

  if (!file) {
    return false;
  }

  const now = new Date();
  const effectiveExpiresAt = file.expiresAt ?? deriveExpiresAt(file.uploadedAt, file.epochs);

  if (effectiveExpiresAt > now) {
    return false;
  }

  if (!file.expiresAt) {
    try {
      await prisma.file.update({
        where: { id: file.id },
        data: { expiresAt: effectiveExpiresAt },
      });
    } catch {
      // Best effort only; deletion can proceed regardless.
    }
  }

  await deleteFileIds([file.id]);
  return true;
}
