import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { hashPassword } from '../../_utils/password';

export async function POST(request: NextRequest) {
  try {
    const { userId, token, newPassword } = await request.json();
    if (!userId || !token || !newPassword) return NextResponse.json({ error: 'userId, token, newPassword required' }, { status: 400 });

    // find token
    const rec = await prisma.recoveryToken.findUnique({ where: { token } });
    if (!rec || rec.userId !== userId) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });
    if (rec.used) return NextResponse.json({ error: 'Token already used' }, { status: 400 });
    if (rec.expiresAt < new Date()) return NextResponse.json({ error: 'Token expired' }, { status: 400 });

    // update password
    const newHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    // mark token used
    await prisma.recoveryToken.update({ where: { id: rec.id }, data: { used: true } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('reset-password error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
