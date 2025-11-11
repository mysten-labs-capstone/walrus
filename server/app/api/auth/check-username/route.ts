import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username parameter required' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 30) {
      return NextResponse.json({ available: false, error: 'Username must be 3-30 characters' }, { status: 200 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json({ available: false, error: 'Invalid characters in username' }, { status: 200 });
    }

    const existingUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });

    return NextResponse.json({ available: !existingUser, username }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to check username availability' }, { status: 500 });
  }
}