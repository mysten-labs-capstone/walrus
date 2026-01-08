import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { hashPassword, validatePassword } from '../../_utils/password';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    console.log('[Signup] ========== NEW SIGNUP REQUEST ==========');
    console.log('[Signup] Request URL:', request.url);
    console.log('[Signup] Request method:', request.method);
    console.log('[Signup] Request headers:', Object.fromEntries(request.headers.entries()));
    
    let body;
    try {
      body = await request.json();
      console.log('[Signup] Body parsed successfully');
      console.log('[Signup] Body keys:', Object.keys(body));
      console.log('[Signup] Username:', body.username);
      console.log('[Signup] Password length:', body.password?.length);
    } catch (parseError) {
      console.error('[Signup] Failed to parse JSON body:', parseError);
      return NextResponse.json({ 
        error: 'Invalid JSON body',
        debug: { message: parseError instanceof Error ? parseError.message : String(parseError) }
      }, { status: 400 });
    }
    
    const { username, password } = body;

    if (!username || !password) {
      console.log('[Signup] Missing credentials - username:', !!username, 'password:', !!password);
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 30) {
      console.log('[Signup] Invalid username length:', username.length);
      return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      console.log('[Signup] Invalid username format:', username);
      return NextResponse.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' }, { status: 400 });
    }

    console.log('[Signup] Validating password...');
    let passwordValidation;
    try {
      passwordValidation = validatePassword(password);
      console.log('[Signup] Password validation result:', passwordValidation);
    } catch (validationError) {
      console.error('[Signup] Password validation threw error:', validationError);
      return NextResponse.json({ 
        error: 'Password validation failed',
        debug: { message: validationError instanceof Error ? validationError.message : String(validationError) }
      }, { status: 500 });
    }
    
    if (!passwordValidation.valid) {
      console.log('[Signup] Password validation failed:', passwordValidation.errors);
      return NextResponse.json({ error: 'Password does not meet requirements', details: passwordValidation.errors }, { status: 400 });
    }

    console.log('[Signup] Checking if user exists...');
    let existingUser;
    try {
      existingUser = await prisma.user.findUnique({ where: { username } });
      console.log('[Signup] Database query completed. User exists:', !!existingUser);
    } catch (dbError) {
      console.error('[Signup] Database error checking user:', dbError);
      return NextResponse.json({ 
        error: 'Database error',
        debug: { 
          message: dbError instanceof Error ? dbError.message : String(dbError),
          stack: dbError instanceof Error ? dbError.stack : undefined
        }
      }, { status: 500 });
    }
    
    if (existingUser) {
      console.log('[Signup] Username already taken');
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    console.log('[Signup] Generating private key...');
    let privateKey;
    try {
      privateKey = crypto.randomBytes(32).toString('hex');
      console.log('[Signup] Private key generated, length:', privateKey.length);
    } catch (cryptoError) {
      console.error('[Signup] Crypto error:', cryptoError);
      return NextResponse.json({ 
        error: 'Failed to generate encryption key',
        debug: { message: cryptoError instanceof Error ? cryptoError.message : String(cryptoError) }
      }, { status: 500 });
    }
    
    console.log('[Signup] Hashing password...');
    let passwordHash;
    try {
      passwordHash = await hashPassword(password);
      console.log('[Signup] Password hashed successfully, hash length:', passwordHash.length);
    } catch (hashError) {
      console.error('[Signup] Password hashing error:', hashError);
      return NextResponse.json({ 
        error: 'Failed to hash password',
        debug: { 
          message: hashError instanceof Error ? hashError.message : String(hashError),
          stack: hashError instanceof Error ? hashError.stack : undefined
        }
      }, { status: 500 });
    }
    
    console.log('[Signup] Creating user in database...');
    console.log('[Signup] User data to create:', {
      username,
      passwordHashLength: passwordHash.length,
      privateKeyLength: `0x${privateKey}`.length
    });
    
    let user;
    try {
      user = await prisma.user.create({
        data: { 
          username, 
          passwordHash,
          privateKey: `0x${privateKey}`
        },
        select: { id: true, username: true, createdAt: true },
      });
      console.log('[Signup] User created successfully');
      console.log('[Signup] User ID:', user.id);
      console.log('[Signup] Username:', user.username);
      console.log('[Signup] Created at:', user.createdAt);
    } catch (createError) {
      console.error('[Signup] Database error creating user:', createError);
      console.error('[Signup] Error name:', createError instanceof Error ? createError.name : 'Unknown');
      console.error('[Signup] Error message:', createError instanceof Error ? createError.message : String(createError));
      console.error('[Signup] Error stack:', createError instanceof Error ? createError.stack : 'No stack');
      return NextResponse.json({ 
        error: 'Failed to create user',
        debug: { 
          message: createError instanceof Error ? createError.message : String(createError),
          name: createError instanceof Error ? createError.name : undefined,
          stack: createError instanceof Error ? createError.stack : undefined
        }
      }, { status: 500 });
    }

    console.log('[Signup] ========== SIGNUP SUCCESSFUL ==========');
    return NextResponse.json({ success: true, user }, { status: 201 });
    
  } catch (error) {
    console.error('[Signup] ========== UNCAUGHT ERROR ==========');
    console.error('[Signup] Error type:', typeof error);
    console.error('[Signup] Error name:', error instanceof Error ? error.name : 'Unknown');
    console.error('[Signup] Error message:', error instanceof Error ? error.message : String(error));
    console.error('[Signup] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('[Signup] Full error object:', error);
    
    return NextResponse.json({ 
      error: 'Internal server error during signup',
      debug: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error
      }
    }, { status: 500 });
  }
}