import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";
import { clearFolderCache } from "../../_utils/folderCache";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * POST /api/files/move - Move file(s) to a folder
 * Body: { userId, blobIds: string[], folderId: string | null }
 * Set folderId to null to move to root
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, blobIds, folderId } = body ?? {};

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (!Array.isArray(blobIds) || blobIds.length === 0) {
      return NextResponse.json(
        { error: "blobIds array is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Validate target folder exists AND belongs to user (single query)
    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
        select: { id: true },
      });

      if (!folder) {
        // You previously returned 404 if not found and 403 if not owned.
        // With this combined check, we return 404 to avoid leaking existence.
        return NextResponse.json(
          { error: "Target folder not found" },
          { status: 404, headers: withCORS(req) },
        );
      }
    }

    // Fast path: move all files in a single updateMany
    const result = await prisma.file.updateMany({
      where: {
        blobId: { in: blobIds },
        userId,
      },
      data: {
        folderId: folderId || null,
      },
    });

    // If some blobIds were missing/not owned, only then compute which ones.
    if (result.count !== blobIds.length) {
      const found = await prisma.file.findMany({
        where: {
          blobId: { in: blobIds },
          userId,
        },
        select: { blobId: true },
      });

      const foundSet = new Set(found.map((f) => f.blobId));
      const missingBlobIds = blobIds.filter((id: string) => !foundSet.has(id));

      return NextResponse.json(
        {
          error: `Some files not found or don't belong to user`,
          missing: missingBlobIds,
        },
        { status: 404, headers: withCORS(req) },
      );
    }

    clearFolderCache(userId);

    return NextResponse.json(
      {
        message: `Moved ${result.count} file(s)`,
        movedCount: result.count,
        targetFolderId: folderId || null,
      },
      { headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FILES MOVE] Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to move files" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
