import { NextResponse } from 'next/server';
import { withCORS } from '../../_utils/cors';
import prisma from '../../_utils/prisma';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: withCORS(req) });
}

/**
 * GET /api/shares/user?userId=xxx
 * Get all active shares for a user
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get all shares created by this user that are still active
    const shares = await prisma.share.findMany({
      where: {
        createdBy: userId,
        revokedAt: null,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } }
        ]
      },
      include: {
        file: {
          select: {
            id: true,
            blobId: true,
            filename: true,
            originalSize: true,
            contentType: true,
            uploadedAt: true,
            epochs: true,
            encrypted: true,
            wrappedFileKey: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Format response
    const formattedShares = shares.map(share => ({
      shareId: share.id,
      blobId: share.blobId,
      filename: share.file.filename,
      fileSize: share.file.originalSize,
      contentType: share.file.contentType,
      uploadedAt: share.file.uploadedAt,
      epochs: share.file.epochs,
      encrypted: share.file.encrypted,
      wrappedFileKey: share.file.wrappedFileKey,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
    }));

    return NextResponse.json(
      { shares: formattedShares },
      { headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[GET /api/shares/user] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch shares' },
      { status: 500, headers: withCORS(req) }
    );
  }
}
