import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";
import { clearFolderCache } from "../../_utils/folderCache";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/folders/[folderId] - Get folder details with files
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    const { folderId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        files: {
          orderBy: { uploadedAt: "desc" },
          select: {
            id: true,
            blobId: true,
            filename: true,
            originalSize: true,
            contentType: true,
            encrypted: true,
            epochs: true,
            uploadedAt: true,
            status: true,
            s3Key: true,
          },
        },
        children: {
          orderBy: { name: "asc" },
          include: {
            _count: { select: { files: true, children: true } },
          },
        },
        parent: {
          select: { id: true, name: true, parentId: true },
        },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (folder.userId !== userId) {
      return NextResponse.json(
        { error: "Folder does not belong to user" },
        { status: 403, headers: withCORS(req) },
      );
    }

    // Build breadcrumb path
    const breadcrumbs = [];
    let currentFolder: any = folder;
    while (currentFolder) {
      breadcrumbs.unshift({ id: currentFolder.id, name: currentFolder.name });
      currentFolder = currentFolder.parent;
      // Fetch parent if needed
      if (currentFolder?.parentId) {
        currentFolder = await prisma.folder.findUnique({
          where: { id: currentFolder.parentId },
          select: { id: true, name: true, parentId: true },
        });
      } else if (currentFolder) {
        currentFolder = null;
      }
    }

    return NextResponse.json(
      {
        folder: {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          color: folder.color,
          createdAt: folder.createdAt,
        },
        files: folder.files,
        children: folder.children.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          fileCount: c._count.files,
          childCount: c._count.children,
        })),
        breadcrumbs,
      },
      { headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FOLDER GET] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch folder" },
      { status: 500, headers: withCORS(req) },
    );
  }
}

/**
 * PATCH /api/folders/[folderId] - Update folder (rename, change color, move)
 * Body: { userId, name?, color?, parentId? }
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    const { folderId } = await params;
    const body = await req.json();
    const { userId, name, color, parentId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (folder.userId !== userId) {
      return NextResponse.json(
        { error: "Folder does not belong to user" },
        { status: 403, headers: withCORS(req) },
      );
    }

    // Prevent moving folder into itself or its descendants
    if (parentId !== undefined) {
      if (parentId === folderId) {
        return NextResponse.json(
          { error: "Cannot move folder into itself" },
          { status: 400, headers: withCORS(req) },
        );
      }

      // Check if parentId is a descendant of this folder
      if (parentId) {
        let checkFolder = await prisma.folder.findUnique({
          where: { id: parentId },
        });
        while (checkFolder) {
          if (checkFolder.parentId === folderId) {
            return NextResponse.json(
              { error: "Cannot move folder into its own descendant" },
              { status: 400, headers: withCORS(req) },
            );
          }
          if (checkFolder.parentId) {
            checkFolder = await prisma.folder.findUnique({
              where: { id: checkFolder.parentId },
            });
          } else {
            break;
          }
        }
      }
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: {
        ...(name && { name: name.trim() }),
        ...(color !== undefined && { color }),
        ...(parentId !== undefined && { parentId: parentId || null }),
      },
    });

    clearFolderCache(userId);

    return NextResponse.json(
      { folder: updatedFolder },
      { headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FOLDER PATCH] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to update folder" },
      { status: 500, headers: withCORS(req) },
    );
  }
}

/**
 * DELETE /api/folders/[folderId] - Delete folder
 * Query params: userId (required)
 * Note: Files in the folder will have their folderId set to null (moved to root)
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  try {
    const { folderId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        _count: { select: { files: true, children: true } },
      },
    });

    if (!folder) {
      return NextResponse.json(
        { error: "Folder not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (folder.userId !== userId) {
      return NextResponse.json(
        { error: "Folder does not belong to user" },
        { status: 403, headers: withCORS(req) },
      );
    }

    // Move all files in this folder (and subfolders) to root
    // This is handled by the onDelete: SetNull in the schema

    // Delete folder (cascade will delete subfolders)
    await prisma.folder.delete({
      where: { id: folderId },
    });

    clearFolderCache(userId);

    return NextResponse.json(
      { message: "Folder deleted", filesOrphaned: folder._count.files },
      { headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FOLDER DELETE] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete folder" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
