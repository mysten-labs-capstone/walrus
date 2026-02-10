import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import { s3Service } from "@/utils/s3Service";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for Render/Netlify

const DECENTRALIZING_DELETE_ERROR =
  "File is still decentralizing. Please wait until the upload completes before deleting.";

async function resolveBlobObjectId(
  walrusClient: any,
  suiClient: any,
  owner: string,
  blobId: string,
): Promise<string | null> {
  const { blobIdToInt } = await import("@mysten/walrus");
  const targetBlobId = blobIdToInt(blobId).toString();
  const blobType = await walrusClient.getBlobType();

  let cursor: string | null = null;
  for (let page = 0; page < 20; page += 1) {
    const result = await suiClient.getOwnedObjects({
      owner,
      filter: { StructType: blobType },
      options: { showContent: true },
      cursor,
      limit: 50,
    });

    for (const entry of result.data ?? []) {
      const content = (entry as any)?.data?.content;
      const fields = content && content.fields ? content.fields : null;
      const objectBlobId = fields?.blob_id?.toString?.() ?? null;

      if (objectBlobId && objectBlobId === targetBlobId) {
        return (entry as any)?.data?.objectId ?? null;
      }
    }

    if (!result.hasNextPage) {
      break;
    }
    cursor = result.nextCursor ?? null;
    if (!cursor) {
      break;
    }
  }

  return null;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { blobId, userId } = body ?? {};

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Check if user owns this file
    await cacheService.init();
    const fileRecord = await cacheService.prisma.file.findUnique({
      where: { blobId },
      select: { userId: true, blobObjectId: true, s3Key: true, status: true },
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (fileRecord.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized - you can only delete your own files" },
        { status: 403, headers: withCORS(req) },
      );
    }

    if (
      blobId.startsWith("temp_") ||
      fileRecord.status === "pending" ||
      fileRecord.status === "processing"
    ) {
      return NextResponse.json(
        { error: DECENTRALIZING_DELETE_ERROR },
        { status: 409, headers: withCORS(req) },
      );
    }

    let blobObjectId = fileRecord.blobObjectId || null;
    let walrusClient: any = null;
    let signer: any = null;
    let suiClient: any = null;

    if (!blobObjectId) {
      try {
        const { initWalrus } = await import("@/utils/walrusClient");
        const walrusInit = await initWalrus();
        walrusClient = walrusInit.walrusClient;
        signer = walrusInit.signer;
        suiClient = walrusInit.suiClient;

        const signerAddress = signer.toSuiAddress();
        const resolvedBlobObjectId = await resolveBlobObjectId(
          walrusClient,
          suiClient,
          signerAddress,
          blobId,
        );

        if (!resolvedBlobObjectId) {
          return NextResponse.json(
            { error: DECENTRALIZING_DELETE_ERROR },
            { status: 409, headers: withCORS(req) },
          );
        }

        await prisma.file.updateMany({
          where: { blobId },
          data: { blobObjectId: resolvedBlobObjectId },
        });

        blobObjectId = resolvedBlobObjectId;
      } catch (resolveErr: any) {
        console.error("Walrus resolve failed:", resolveErr);
        return NextResponse.json(
          {
            error: "Failed to verify Walrus status",
            details: resolveErr?.message || String(resolveErr),
          },
          { status: 500, headers: withCORS(req) },
        );
      }
    }

    // Attempt to delete the blob from Walrus (wallet) if we have the on-chain object ID
    let walrusDeleted = false;
    if (blobObjectId) {
      try {
        if (!walrusClient || !signer) {
          const { initWalrus } = await import("@/utils/walrusClient");
          const walrusInit = await initWalrus();
          walrusClient = walrusInit.walrusClient;
          signer = walrusInit.signer;
        }
        await walrusClient.executeDeleteBlobTransaction({
          blobObjectId,
          signer,
        });
        walrusDeleted = true;
      } catch (walrusErr: any) {
        console.error("Walrus delete failed:", walrusErr);
        return NextResponse.json(
          {
            error: "Failed to delete blob from wallet",
            details: walrusErr?.message || String(walrusErr),
          },
          { status: 500, headers: withCORS(req) },
        );
      }
    }

    // Delete from S3 cache if exists
    if (fileRecord.s3Key && s3Service.isEnabled()) {
      try {
        await s3Service.delete(fileRecord.s3Key);
      } catch (s3Err) {
        console.warn(`S3 deletion failed:`, s3Err);
      }
    }

    // Delete from cache if exists
    try {
      await cacheService.delete(blobId, userId);
    } catch (cacheErr) {
      console.warn(`Cache deletion failed:`, cacheErr);
    }

    // Delete file and all related shares in a single transaction
    await prisma.$transaction(
      async (tx) => {
        // Get the file ID
        const fileToDelete = await tx.file.findUnique({
          where: { blobId },
          select: { id: true },
        });

        if (fileToDelete) {
          // Get share IDs for this file
          const shares = await tx.share.findMany({
            where: { fileId: fileToDelete.id },
            select: { id: true },
          });

          const shareIds = shares.map((s) => s.id);

          // Delete all SavedShare records in one query
          if (shareIds.length > 0) {
            const deletedSavedShares = await tx.savedShare.deleteMany({
              where: { shareId: { in: shareIds } },
            });
          }
        }

        // Delete the file (this will cascade delete Share records)
        await tx.file.delete({
          where: { blobId },
        });
      },
      {
        timeout: 15000, // 15 seconds - increased from default 5s to prevent timeout errors
      },
    );

    return NextResponse.json(
      {
        message: "File deleted successfully",
        blobId,
        walrusDeleted,
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("❗ Delete error:", err);
    return NextResponse.json(
      { error: err.message || "Delete failed" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
