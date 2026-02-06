import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";
import {
  FOLDER_CACHE_TTL_SECONDS,
  getFolderFlatCache,
  updateFolderCache,
  type FlatFolder,
} from "../../_utils/folderCache";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/folders/tree - List all folders for a user as a flat list
 * Query params: userId (required)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const cachedFlat = getFolderFlatCache(userId);
    if (cachedFlat) {
      return NextResponse.json(
        { folders: cachedFlat },
        {
          headers: withCORS(req, {
            "Cache-Control": `private, max-age=${FOLDER_CACHE_TTL_SECONDS}`,
          }),
        },
      );
    }

    const folders = await prisma.folder.findMany({
      where: { userId },
      include: {
        _count: {
          select: { files: true, children: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const flatFolders: FlatFolder[] = folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      color: folder.color,
      fileCount: folder._count.files,
      childCount: folder._count.children,
      createdAt: folder.createdAt,
    }));

    updateFolderCache(userId, { flat: flatFolders });

    return NextResponse.json(
      { folders: flatFolders },
      {
        headers: withCORS(req, {
          "Cache-Control": `private, max-age=${FOLDER_CACHE_TTL_SECONDS}`,
        }),
      },
    );
  } catch (err: any) {
    console.error("[FOLDERS TREE GET] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch folders" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
