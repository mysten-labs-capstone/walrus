import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
