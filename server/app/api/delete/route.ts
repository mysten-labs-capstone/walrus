import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for Render/Netlify

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
      select: { userId: true },
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

    // Note: Walrus blobs cannot be immediately deleted - they expire after their epoch duration
    // We only remove the reference from our database and cache

    // Delete from cache if exists
    try {
      await cacheService.delete(blobId, userId);
    } catch (cacheErr) {
      console.warn(`Cache deletion failed:`, cacheErr);
    }

    // Delete file and all related shares in a single transaction
    await prisma.$transaction(async (tx) => {
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
    });

    return NextResponse.json(
      {
        message: "File deleted successfully",
        blobId,
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
