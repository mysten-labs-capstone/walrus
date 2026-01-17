import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { withCORS } from '../../_utils/cors';
import crypto from 'crypto';

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400, headers: withCORS(request) });
    }

    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        privateKey: true,
        createdAt: true,
        _count: {
          select: { files: true }
        }
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: withCORS(request) });
    }

    // Auto-generate private key if missing (for existing users)
    if (!user.privateKey) {
      const privateKey = '0x' + crypto.randomBytes(32).toString('hex');
      
      await prisma.user.update({
        where: { id: userId },
        data: { privateKey }
      });
      
      user.privateKey = privateKey;
      console.log(`✅ Auto-generated private key for user: ${user.username}`);
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      privateKey: user.privateKey,
      createdAt: user.createdAt,
      fileCount: user._count.files,
    }, { headers: withCORS(request) });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: withCORS(request) });
  }
}
