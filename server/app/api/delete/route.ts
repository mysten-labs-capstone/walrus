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
        { status: 400, headers: withCORS(req) }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if user owns this file
    await cacheService.init();
    const fileRecord = await cacheService.prisma.file.findUnique({
      where: { blobId },
      select: { userId: true }
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    if (fileRecord.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized - you can only delete your own files" },
        { status: 403, headers: withCORS(req) }
      );
    }

    console.log(`🗑️  Deleting blob ${blobId} for user ${userId}`);

    // Note: Walrus blobs cannot be immediately deleted - they expire after their epoch duration
    // We only remove the reference from our database and cache

    // Delete from cache if exists
    try {
      await cacheService.delete(blobId, userId);
      console.log(`🗑️  Deleted from cache: ${blobId}`);
    } catch (cacheErr) {
      console.warn(`⚠️  Cache deletion failed:`, cacheErr);
    }

    // First, get the file ID to clean up related shares
    const fileToDelete = await prisma.file.findUnique({
      where: { blobId },
      select: { id: true }
    });

    if (fileToDelete) {
      // Get all share IDs for this file
      const shares = await prisma.share.findMany({
        where: { fileId: fileToDelete.id },
        select: { id: true }
      });

      const shareIds = shares.map(s => s.id);

      // Delete all SavedShare records that reference these shares
      if (shareIds.length > 0) {
        const deletedSavedShares = await prisma.savedShare.deleteMany({
          where: { shareId: { in: shareIds } }
        });
        console.log(`🗑️  Deleted ${deletedSavedShares.count} saved share references`);
      }
    }

    // Delete from database (this will cascade delete Share records)
    await prisma.file.delete({
      where: { blobId }
    });
    console.log(`✅ Deleted from database: ${blobId}`);

    return NextResponse.json(
      { 
        message: "File deleted successfully",
        blobId 
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Delete error:", err);
    return NextResponse.json(
      { error: err.message || "Delete failed" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
