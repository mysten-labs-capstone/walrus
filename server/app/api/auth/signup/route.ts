import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { hashPassword, validatePassword } from '../../_utils/password';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 30) {
      return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' }, { status: 400 });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: 'Password does not meet requirements', details: passwordValidation.errors }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    // Generate unique private key for user (32 bytes = 64 hex chars)
    const privateKey = crypto.randomBytes(32).toString('hex');
    
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { 
        username, 
        passwordHash,
        privateKey: `0x${privateKey}` // Store with 0x prefix
      },
      select: { id: true, username: true, createdAt: true },
    });

    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error during signup' }, { status: 500 });
  }
}