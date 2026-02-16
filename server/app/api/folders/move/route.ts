import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";
import { clearFolderCache } from "../../_utils/folderCache";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * POST /api/folders/move - Move multiple folders to a new parent
 * Body: { userId, folderIds: string[], parentId: string | null }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, folderIds, parentId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      return NextResponse.json(
        { error: "folderIds array is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Validate all folders belong to the user
    const folders = await prisma.folder.findMany({
      where: {
        id: { in: folderIds },
        userId,
      },
    });

    if (folders.length !== folderIds.length) {
      return NextResponse.json(
        { error: "One or more folders not found or do not belong to user" },
        { status: 403, headers: withCORS(req) },
      );
    }

    // Prevent moving a folder into itself
    if (parentId && folderIds.includes(parentId)) {
      return NextResponse.json(
        { error: "Cannot move folder into itself" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // If moving to a specific parent, check if it's a descendant of any folder being moved
    if (parentId) {
      const isDescendant = async (
        checkParentId: string,
        ancestorIds: string[],
      ): Promise<boolean> => {
        let currentFolder = await prisma.folder.findUnique({
          where: { id: checkParentId },
          select: { parentId: true },
        });

        while (currentFolder?.parentId) {
          if (ancestorIds.includes(currentFolder.parentId)) {
            return true;
          }
          currentFolder = await prisma.folder.findUnique({
            where: { id: currentFolder.parentId },
            select: { parentId: true },
          });
        }
        return false;
      };

      const isCircular = await isDescendant(parentId, folderIds);
      if (isCircular) {
        return NextResponse.json(
          { error: "Cannot move folder into its own descendant" },
          { status: 400, headers: withCORS(req) },
        );
      }
    }

    // Move all folders
    const updatePromises = folderIds.map((folderId) =>
      prisma.folder.update({
        where: { id: folderId },
        data: { parentId: parentId || null },
      }),
    );

    await Promise.all(updatePromises);

    clearFolderCache(userId);

    return NextResponse.json(
      {
        message: "Folders moved successfully",
        movedCount: folderIds.length,
      },
      { headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FOLDERS MOVE] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to move folders" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
