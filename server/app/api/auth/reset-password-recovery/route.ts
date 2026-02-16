import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { hashPassword, validatePassword } from "../../_utils/password";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  try {
    const { username, newPassword, encryptedRecoveryPhrase } =
      await request.json();

    if (!username || !newPassword) {
      return NextResponse.json(
        { error: "Username and new password are required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          error: "Password is not strong enough",
          details: passwordValidation.errors,
        },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Find user by username
    const normalizedUsername = username.toLowerCase();
    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(request) },
      );
    }

    // Hash and update password, and update encrypted recovery phrase
    const newPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        encryptedRecoveryPhrase: encryptedRecoveryPhrase || undefined,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Password reset successfully",
      },
      { headers: withCORS(request) },
    );
  } catch (error) {
    console.error("Password reset error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
