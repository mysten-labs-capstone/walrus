import { NextResponse, NextRequest } from 'next/server';
import { withCORS } from '../../_utils/cors';
import prisma from '../../_utils/prisma';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: withCORS(req) });
}

/**
 * POST /api/shares/:shareId/save
 * Save a shared file to the current user's "Shared Files" collection
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { shareId: string } }
) {
  try {
    const { shareId } = params;
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (!shareId) {
      return NextResponse.json(
        { error: 'Missing shareId' },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get share details and verify it's valid
    const share = await prisma.share.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: {
            filename: true,
            originalSize: true,
            contentType: true,
            userId: true,
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Check if share is revoked
    if (share.revokedAt) {
      return NextResponse.json(
        { error: 'This share link has been revoked' },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Check if share is expired
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: 'This share link has expired' },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Check download limit
    if (
      share.maxDownloads !== null &&
      share.downloadCount >= share.maxDownloads
    ) {
      return NextResponse.json(
        { error: 'Download limit reached for this share' },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Get uploader user info
    const uploader = await prisma.user.findUnique({
      where: { id: share.file.userId },
      select: { username: true },
    });

    if (!uploader) {
      return NextResponse.json(
        { error: 'Uploader user not found' },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Check if already saved to prevent duplicates
    const existingSave = await prisma.savedShare.findUnique({
      where: {
        userId_shareId: {
          userId,
          shareId,
        },
      },
    });

    if (existingSave) {
      // Already saved, just return success
      return NextResponse.json(
        {
          id: existingSave.id,
          shareId: existingSave.shareId,
          filename: existingSave.filename,
          savedAt: existingSave.savedAt,
          message: 'File already saved',
        },
        { status: 200, headers: withCORS(req) }
      );
    }

    // Save the share reference
    const savedShare = await prisma.savedShare.create({
      data: {
        userId,
        shareId,
        blobId: share.blobId,
        filename: share.file.filename,
        originalSize: share.file.originalSize,
        contentType: share.file.contentType,
        uploadedBy: share.file.userId,
        uploadedByUsername: uploader.username,
      },
    });

    console.log(
      `[SAVE SHARE] User ${userId} saved share ${shareId} (file: ${share.file.filename})`
    );

    return NextResponse.json(
      {
        id: savedShare.id,
        shareId: savedShare.shareId,
        filename: savedShare.filename,
        savedAt: savedShare.savedAt,
        message: 'File saved successfully',
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[POST /api/shares/:shareId/save] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to save share' },
      { status: 500, headers: withCORS(req) }
    );
  }
}
