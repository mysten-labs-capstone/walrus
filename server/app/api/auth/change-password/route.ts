import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../_utils/prisma';
import { hashPassword, verifyPassword } from '../../_utils/password';
import { withCORS } from '../../_utils/cors';

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  try {
    const { userId, oldPassword, newPassword } = await request.json();

    if (!userId || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: 'userId, oldPassword, and newPassword are required' },
        { status: 400, headers: withCORS(request) }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400, headers: withCORS(request) }
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404, headers: withCORS(request) });
    }

    // Verify old password
    const isValid = await verifyPassword(oldPassword, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401, headers: withCORS(request) }
      );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully',
    }, { headers: withCORS(request) });
  } catch (error) {
    console.error('Password change error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: withCORS(request) }
    );
  }
}
