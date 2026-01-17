import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { verifyPassword } from '../../_utils/password';
import { withCORS } from '../../_utils/cors';

export async function OPTIONS(req: Request) {
  console.log('[LOGIN OPTIONS] Preflight request received');
  console.log('[LOGIN OPTIONS] Origin:', req.headers.get('origin'));
  const headers = withCORS(req);
  console.log('[LOGIN OPTIONS] Response headers:', Object.fromEntries(headers.entries()));
  return new Response(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400, headers: withCORS(request) });
    }

    // Normalize username to lowercase for case-insensitive login
    const normalizedUsername = username.toLowerCase();

    const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers: withCORS(request) });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401, headers: withCORS(request) });
    }

    return NextResponse.json({ success: true, user: { id: user.id, username: user.username } }, { status: 200, headers: withCORS(request) });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error during login' }, { status: 500, headers: withCORS(request) });
  }
}