import { NextResponse, NextRequest } from 'next/server';
import { withCORS } from '../../../_utils/cors';
import prisma from '../../../_utils/prisma';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { headers: withCORS(req) });
}

/**
 * DELETE /api/shares/saved/:id
 * Remove a saved share from user's collection
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id' },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get the saved share to verify ownership
    const savedShare = await prisma.savedShare.findUnique({
      where: { id },
    });

    if (!savedShare) {
      return NextResponse.json(
        { error: 'Saved share not found' },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Delete the saved share
    await prisma.savedShare.delete({
      where: { id },
    });

    console.log(`[DELETE /api/shares/saved/:id] Removed saved share ${id}`);

    return NextResponse.json(
      { success: true, message: 'Saved share removed' },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[DELETE /api/shares/saved/:id] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to remove saved share' },
      { status: 500, headers: withCORS(req) }
    );
  }
}
