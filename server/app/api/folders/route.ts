import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/folders - List all folders for a user
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

    // Recursive function to build folder tree with nested children
    const buildFolderTree = async (parentId: string | null): Promise<any[]> => {
      const folders = await prisma.folder.findMany({
        where: { userId, parentId },
        include: {
          _count: {
            select: { files: true, children: true },
          },
        },
        orderBy: { name: "asc" },
      });

      const result = [];
      for (const folder of folders) {
        const children = await buildFolderTree(folder.id);
        result.push({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          color: folder.color,
          fileCount: folder._count.files,
          childCount: folder._count.children,
          createdAt: folder.createdAt,
          children,
        });
      }
      return result;
    };

    const rootFolders = await buildFolderTree(null);

    return NextResponse.json(
      { folders: rootFolders },
      { headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FOLDERS GET] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch folders" },
      { status: 500, headers: withCORS(req) },
    );
  }
}

/**
 * POST /api/folders - Create a new folder
 * Body: { userId, name, parentId?, color? }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, name, parentId, color } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Sanity check: ensure Prisma has expected model
    if (!prisma || !prisma.folder) {
      console.error(
        "[FOLDERS POST] Prisma client missing folder model or not initialized",
      );
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers: withCORS(req) },
      );
    }

    // Validate parent folder exists and belongs to user
    if (parentId) {
      const parentFolder = await prisma.folder.findUnique({
        where: { id: parentId },
      });

      if (!parentFolder) {
        return NextResponse.json(
          { error: "Parent folder not found" },
          { status: 404, headers: withCORS(req) },
        );
      }

      if (parentFolder.userId !== userId) {
        return NextResponse.json(
          { error: "Parent folder does not belong to user" },
          { status: 403, headers: withCORS(req) },
        );
      }
    }

    // Check for duplicate folder name in same location
    const existingFolder = await prisma.folder.findFirst({
      where: {
        userId,
        parentId: parentId || null,
        name: name.trim(),
      },
    });

    if (existingFolder) {
      return NextResponse.json(
        { error: "A folder with this name already exists in this location" },
        { status: 409, headers: withCORS(req) },
      );
    }

    const folder = await prisma.folder.create({
      data: {
        userId,
        name: name.trim(),
        parentId: parentId || null,
        color: color || null,
      },
    });

    return NextResponse.json(
      { folder },
      { status: 201, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[FOLDERS POST] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create folder" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
