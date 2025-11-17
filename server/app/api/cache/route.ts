import { NextResponse } from 'next/server';
import { cacheService } from '@/utils/cacheService';
import { withCORS } from '../_utils/cors';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/cache?userId=xxx - Get user's cached files
 * GET /api/cache?action=stats - Get cache statistics
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');

    await cacheService.init();

    if (action === 'stats') {
      const totalSize = await cacheService.getCacheSize();
      return NextResponse.json(
        {
          totalSize,
          totalSizeFormatted: formatBytes(totalSize),
        },
        { headers: withCORS(req) }
      );
    }

    if (userId) {
      const files = await cacheService.getUserFiles(userId);
      return NextResponse.json(
        { files, count: files.length },
        { headers: withCORS(req) }
      );
    }

    return NextResponse.json(
      { error: 'Missing userId or action parameter' },
      { status: 400, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('Cache GET error:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

/**
 * POST /api/cache - Cache operations
 * Body: { action: 'check', blobId, userId }
 * Body: { action: 'delete', blobId, userId }
 * Body: { action: 'cleanup' }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, blobId, userId } = body;

    await cacheService.init();

    switch (action) {
      case 'check': {
        if (!blobId || !userId) {
          return NextResponse.json(
            { error: 'Missing blobId or userId' },
            { status: 400, headers: withCORS(req) }
          );
        }
        const cached = await cacheService.isCached(blobId, userId);
        return NextResponse.json({ cached }, { headers: withCORS(req) });
      }

      case 'delete': {
        if (!blobId || !userId) {
          return NextResponse.json(
            { error: 'Missing blobId or userId' },
            { status: 400, headers: withCORS(req) }
          );
        }
        await cacheService.delete(blobId, userId);
        return NextResponse.json(
          { message: 'Cache entry deleted' },
          { headers: withCORS(req) }
        );
      }

      case 'cleanup': {
        await cacheService.cleanup();
        const totalSize = await cacheService.getCacheSize();
        return NextResponse.json(
          {
            message: 'Cleanup complete',
            totalSize,
            totalSizeFormatted: formatBytes(totalSize),
          },
          { headers: withCORS(req) }
        );
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: check, delete, or cleanup' },
          { status: 400, headers: withCORS(req) }
        );
    }
  } catch (err: any) {
    console.error('Cache POST error:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
