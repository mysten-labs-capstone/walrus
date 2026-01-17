import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { hashPassword, validatePassword } from '../../_utils/password';
import { withCORS } from '../../_utils/cors';
import crypto from 'crypto';

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  try {
    const { username, password, securityQuestions } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400, headers: withCORS(request) });
    }

    // Normalize username to lowercase to prevent case-sensitive duplicates
    const normalizedUsername = username.toLowerCase();

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400, headers: withCORS(request) });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, hyphens, and underscores' }, { status: 400, headers: withCORS(request) });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json({ error: 'Password does not meet requirements', details: passwordValidation.errors }, { status: 400, headers: withCORS(request) });
    }

    const existingUser = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (existingUser) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409, headers: withCORS(request) });
    }

    // Generate unique private key for user (32 bytes = 64 hex chars)
    const privateKey = crypto.randomBytes(32).toString('hex');

    const passwordHash = await hashPassword(password);

    // Validate security questions
    if (!Array.isArray(securityQuestions) || securityQuestions.length !== 3) {
      return NextResponse.json({ error: 'Exactly 3 security questions are required' }, { status: 400 });
    }

    // Prepare nested create for security answers (store hashed answers)
    const securityCreates = [] as any[];
    for (const sq of securityQuestions) {
      if (!sq || !sq.question || !sq.answer) {
        return NextResponse.json({ error: 'Each security question must include question and answer' }, { status: 400 });
      }
      const answerHash = await hashPassword(String(sq.answer));
      securityCreates.push({ question: String(sq.question), answerHash });
    }

    const user = await prisma.user.create({
      data: { 
        username: normalizedUsername, 
        passwordHash,
        privateKey: `0x${privateKey}` ,// Store with 0x prefix
        securityAnswers: { create: securityCreates },
      },
      select: { id: true, username: true, createdAt: true },
    });

    return NextResponse.json({ success: true, user }, { status: 201, headers: withCORS(request) });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error during signup' }, { status: 500, headers: withCORS(request) });
  }
}