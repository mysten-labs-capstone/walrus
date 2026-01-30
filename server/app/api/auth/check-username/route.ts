import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { withCORS } from '../../_utils/cors';

export const runtime = 'nodejs';

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json(
        { error: 'Username parameter required' },
        { status: 400, headers: withCORS(request) }
      );
    }

    // Normalize username to lowercase to check availability case-insensitively
    const normalizedUsername = username.toLowerCase();

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return NextResponse.json(
        { available: false, error: 'Username must be 3-30 characters' },
        { status: 200, headers: withCORS(request) }
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
      return NextResponse.json(
        { available: false, error: 'Invalid characters in username' },
        { status: 200, headers: withCORS(request) }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    return NextResponse.json(
      {
        available: !existingUser,
        username: normalizedUsername,
      },
      { status: 200, headers: withCORS(request) }
    );
  } catch (error) {
    console.error('Username check error:', error);
    return NextResponse.json(
      { error: 'Failed to check username availability' },
      { status: 500, headers: withCORS(request) }
    );
  }
}