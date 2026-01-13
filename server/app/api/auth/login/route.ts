import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { verifyPassword } from '../../_utils/password';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Normalize username to lowercase for case-insensitive login
    const normalizedUsername = username.toLowerCase();

    const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (!user) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    return NextResponse.json({ success: true, user: { id: user.id, username: user.username } }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error during login' }, { status: 500 });
  }
}