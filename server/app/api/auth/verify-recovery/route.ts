import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { verifyPassword } from '../../_utils/password';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { userId, questionId, answer } = await request.json();
    if (!userId || !questionId || !answer) return NextResponse.json({ error: 'userId, questionId, and answer required' }, { status: 400 });

    const record = await prisma.securityAnswer.findUnique({ where: { id: questionId } });
    if (!record || record.userId !== userId) return NextResponse.json({ error: 'Security question not found' }, { status: 404 });

    const ok = await verifyPassword(String(answer), record.answerHash);
    if (!ok) return NextResponse.json({ error: 'Incorrect answer' }, { status: 401 });

    // create short-lived recovery token (15 minutes)
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.recoveryToken.create({ data: { userId, token, expiresAt } });

    return NextResponse.json({ success: true, token });
  } catch (err) {
    console.error('verify-recovery error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
