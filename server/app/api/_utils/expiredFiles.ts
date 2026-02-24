import prisma from "./prisma";

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
