import { NextResponse } from 'next/server';
import { withCORS } from '../../_utils/cors';
import prisma from '../../_utils/prisma';

export const runtime = 'nodejs';

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
    const { userId, blobIds, folderId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (!blobIds || !Array.isArray(blobIds) || blobIds.length === 0) {
      return NextResponse.json(
        { error: 'blobIds array is required' },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Validate target folder exists and belongs to user (if not moving to root)
    if (folderId) {
      const folder = await prisma.folder.findUnique({
        where: { id: folderId }
      });

      if (!folder) {
        return NextResponse.json(
          { error: 'Target folder not found' },
          { status: 404, headers: withCORS(req) }
        );
      }

      if (folder.userId !== userId) {
        return NextResponse.json(
          { error: 'Target folder does not belong to user' },
          { status: 403, headers: withCORS(req) }
        );
      }
    }

    // Verify all files exist and belong to user
    const files = await prisma.file.findMany({
      where: {
        blobId: { in: blobIds },
        userId
      },
      select: { id: true, blobId: true, filename: true }
    });

    if (files.length !== blobIds.length) {
      const foundBlobIds = files.map(f => f.blobId);
      const missingBlobIds = blobIds.filter(id => !foundBlobIds.includes(id));
      return NextResponse.json(
        { error: `Some files not found or don't belong to user`, missing: missingBlobIds },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Move all files
    const result = await prisma.file.updateMany({
      where: {
        blobId: { in: blobIds },
        userId
      },
      data: {
        folderId: folderId || null
      }
    });

    return NextResponse.json(
      {
        message: `Moved ${result.count} file(s)`,
        movedCount: result.count,
        targetFolderId: folderId || null
      },
      { headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[FILES MOVE] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to move files' },
      { status: 500, headers: withCORS(req) }
    );
  }
}
