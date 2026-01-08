import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { hashPassword, validatePassword } from '../../_utils/password';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    console.log('[Signup] Request received');
    
    const body = await request.json();
    console.log('[Signup] Body parsed, username:', body.username);
    
    const { username, password } = body;

    if (!username || !password) {
      console.log('[Signup] Missing credentials');
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 30) {
      console.log('[Signup] Invalid username length');
      return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      console.log('[Signup] Invalid username format');
      return NextResponse.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' }, { status: 400 });
    }

    console.log('[Signup] Validating password...');
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      console.log('[Signup] Password validation failed:', passwordValidation.errors);
      return NextResponse.json({ error: 'Password does not meet requirements', details: passwordValidation.errors }, { status: 400 });
    }

    console.log('[Signup] Checking if user exists...');
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      console.log('[Signup] Username already taken');
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    console.log('[Signup] Generating private key...');
    const privateKey = crypto.randomBytes(32).toString('hex');
    
    console.log('[Signup] Hashing password...');
    const passwordHash = await hashPassword(password);
    
    console.log('[Signup] Creating user in database...');
    const user = await prisma.user.create({
      data: { 
        username, 
        passwordHash,
        privateKey: `0x${privateKey}`
      },
      select: { id: true, username: true, createdAt: true },
    });

    console.log('[Signup] User created successfully:', user.id);
    return NextResponse.json({ success: true, user }, { status: 201 });
  } catch (error) {
    console.error('[Signup] Error occurred:', error);
    console.error('[Signup] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json({ 
      error: 'Internal server error during signup',
      // Temporary for debugging - remove in production
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}