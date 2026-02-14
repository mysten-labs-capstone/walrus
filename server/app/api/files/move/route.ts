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
 * Body: { userId, blobIds?: string[], fileIds?: string[], folderId: string | null }
 * Set folderId to null to move to root
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, blobIds, fileIds, folderId } = body ?? {};

    const normalizedBlobIds = Array.isArray(blobIds)
      ? blobIds.filter(Boolean)
      : [];
    const normalizedFileIds = Array.isArray(fileIds)
      ? fileIds.filter(Boolean)
      : [];

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (normalizedBlobIds.length === 0 && normalizedFileIds.length === 0) {
      return NextResponse.json(
        { error: "blobIds or fileIds array is required" },
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
    const idFilters: Array<{
      id?: { in: string[] };
      blobId?: { in: string[] };
    }> = [];
    if (normalizedFileIds.length > 0) {
      idFilters.push({ id: { in: normalizedFileIds } });
    }
    if (normalizedBlobIds.length > 0) {
      idFilters.push({ blobId: { in: normalizedBlobIds } });
    }

    const whereClause =
      idFilters.length === 1
        ? { userId, ...idFilters[0] }
        : { userId, OR: idFilters };

    const result = await prisma.file.updateMany({
      where: whereClause,
      data: {
        folderId: folderId || null,
      },
    });

    // If some blobIds were missing/not owned, only then compute which ones.
    if (result.count === 0) {
      return NextResponse.json(
        { error: "No matching files found for move" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (result.count < normalizedBlobIds.length + normalizedFileIds.length) {
      const foundById =
        normalizedFileIds.length > 0
          ? await prisma.file.findMany({
              where: {
                id: { in: normalizedFileIds },
                userId,
              },
              select: { id: true },
            })
          : [];

      const foundByBlobId =
        normalizedBlobIds.length > 0
          ? await prisma.file.findMany({
              where: {
                blobId: { in: normalizedBlobIds },
                userId,
              },
              select: { blobId: true },
            })
          : [];

      const foundIdSet = new Set(foundById.map((f) => f.id));
      const foundBlobIdSet = new Set(foundByBlobId.map((f) => f.blobId));

      const missingFileIds = normalizedFileIds.filter(
        (id: string) => !foundIdSet.has(id),
      );
      const missingBlobIds = normalizedBlobIds.filter(
        (id: string) => !foundBlobIdSet.has(id),
      );

      if (missingFileIds.length > 0 || missingBlobIds.length > 0) {
        return NextResponse.json(
          {
            error: "Some files not found or don't belong to user",
            missingFileIds,
            missingBlobIds,
          },
          { status: 404, headers: withCORS(req) },
        );
      }
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
