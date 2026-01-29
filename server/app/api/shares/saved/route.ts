import { NextResponse, NextRequest } from 'next/server';
import { withCORS } from '../../_utils/cors';
import prisma from '../../_utils/prisma';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: withCORS(req) });
}

/**
 * GET /api/shares/saved?userId=xxx
 * Get all saved shares for a user
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400, headers: withCORS(req) }
      );
    }

    const savedShares = await prisma.savedShare.findMany({
      where: { userId },
      orderBy: { savedAt: 'desc' },
    });

    return NextResponse.json(
      { shares: savedShares },
      { headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[GET /api/shares/saved] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch saved shares' },
      { status: 500, headers: withCORS(req) }
    );
  }
}
