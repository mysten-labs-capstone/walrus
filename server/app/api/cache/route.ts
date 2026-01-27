import { NextResponse } from 'next/server';
import { withCORS } from '../_utils/cors';
import prisma from '../_utils/prisma';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * Backwards-compatible /api/cache endpoint: return user's files from DB.
 * This keeps the client working (RecentUploads) while the actual file cache
 * implementation is removed. Downloads do not use this cache.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const action = searchParams.get('action');

    if (action === 'stats') {
      // Return basic stats derived from DB
      const total = await prisma.file.count({ where: {} });
      const userTotal = userId ? await prisma.file.count({ where: { userId } }) : 0;
      return NextResponse.json({ total, userTotal }, { headers: withCORS(req) });
    }

    if (userId) {
      const files = await prisma.file.findMany({
        where: { userId },
        orderBy: { uploadedAt: 'desc' },
        select: {
          id: true,
          blobId: true,
          filename: true,
          originalSize: true,
          contentType: true,
          encrypted: true,
          epochs: true,
          uploadedAt: true,
          lastAccessedAt: true,
          status: true,
          s3Key: true,
          folderId: true,
          folder: {
            select: {
              id: true,
              name: true,
              parentId: true,
              color: true,
            }
          }
        }
      });

      // Build folder paths for each file
      const filesWithPaths = await Promise.all(files.map(async (file) => {
        let folderPath: string[] = [];
        if (file.folder) {
          // Build path from folder to root
          let currentFolder: any = file.folder;
          while (currentFolder) {
            folderPath.unshift(currentFolder.name);
            if (currentFolder.parentId) {
              currentFolder = await prisma.folder.findUnique({
                where: { id: currentFolder.parentId },
                select: { id: true, name: true, parentId: true }
              });
            } else {
              currentFolder = null;
            }
          }
        }
        return {
          ...file,
          folderPath: folderPath.length > 0 ? folderPath.join('/') : null
        };
      }));

      return NextResponse.json({ files: filesWithPaths, count: files.length }, { headers: withCORS(req) });
    }

    return NextResponse.json({ error: 'Missing userId or action parameter' }, { status: 400, headers: withCORS(req) });
  } catch (err: any) {
    console.error('Cache GET error (DB-backed):', err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: withCORS(req) });
  }
}

/**
 * Minimal POST handler to support legacy client calls.
 * - action: 'check' => returns { cached: false }
 * - action: 'delete' => no-op (use /api/delete instead)
 * - action: 'cleanup' => no-op
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, blobId, userId } = body || {};

    switch (action) {
      case 'check':
        return NextResponse.json({ cached: false }, { headers: withCORS(req) });
      case 'delete':
        // Client should call /api/delete — respond with success to avoid errors
        return NextResponse.json({ message: 'delete routed to /api/delete' }, { headers: withCORS(req) });
      case 'cleanup':
        return NextResponse.json({ message: 'cleanup noop' }, { headers: withCORS(req) });
      default:
        return NextResponse.json({ error: 'Invalid action. Use: check, delete, or cleanup' }, { status: 400, headers: withCORS(req) });
    }
  } catch (err: any) {
    console.error('Cache POST error (DB-backed):', err);
    return NextResponse.json({ error: err.message }, { status: 500, headers: withCORS(req) });
  }
}
