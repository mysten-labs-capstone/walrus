import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { hashPassword, hashAuthKey } from "../../_utils/password";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      token,
      newPassword,
      newAuthKey,
      newSalt,
      newEncryptedMasterKey,
    } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // TOKEN-BASED RECOVERY (old flow)
    if (token) {
      if (!newPassword) {
        return NextResponse.json(
          { error: "newPassword required for token-based reset" },
          { status: 400, headers: withCORS(request) },
        );
      }

      // find token
      const rec = await prisma.recoveryToken.findUnique({ where: { token } });
      if (!rec || rec.userId !== userId) {
        return NextResponse.json(
          { error: "Invalid token" },
          { status: 400, headers: withCORS(request) },
        );
      }
      if (rec.used) {
        return NextResponse.json(
          { error: "Token already used" },
          { status: 400, headers: withCORS(request) },
        );
      }
      if (rec.expiresAt < new Date()) {
        return NextResponse.json(
          { error: "Token expired" },
          { status: 400, headers: withCORS(request) },
        );
      }

      // update password
      const newHash = await hashPassword(newPassword);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      });

      // mark token used
      await prisma.recoveryToken.update({
        where: { id: rec.id },
        data: { used: true },
      });

      return NextResponse.json(
        { success: true },
        { headers: withCORS(request) },
      );
    }

    // RECOVERY PHRASE-BASED RESET (new flow)
    // Get user to determine auth system
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authKeyHash: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(request) },
      );
    }

    const hasNewAuth = !!user.authKeyHash;

    if (hasNewAuth) {
      // NEW AUTH SYSTEM: Reset with key derivation
      if (!newAuthKey || !newSalt || !newEncryptedMasterKey) {
        return NextResponse.json(
          {
            error:
              "newAuthKey, newSalt, and newEncryptedMasterKey are required for new auth users",
          },
          { status: 400, headers: withCORS(request) },
        );
      }

      // Validate format
      if (!/^[0-9a-f]{64}$/i.test(newAuthKey)) {
        return NextResponse.json(
          { error: "Invalid auth key format" },
          { status: 400, headers: withCORS(request) },
        );
      }

      if (!/^[0-9a-f]{64}$/i.test(newSalt)) {
        return NextResponse.json(
          { error: "Invalid salt format" },
          { status: 400, headers: withCORS(request) },
        );
      }

      // Hash the new auth key
      const newAuthKeyHash = await hashAuthKey(newAuthKey);

      // Update user with new auth data
      await prisma.user.update({
        where: { id: userId },
        data: {
          authKeyHash: newAuthKeyHash,
          salt: newSalt,
          encryptedMasterKey: newEncryptedMasterKey,
        },
      });

      return NextResponse.json(
        {
          success: true,
          message: "Password reset successfully",
        },
        { headers: withCORS(request) },
      );
    } else {
      // OLD AUTH SYSTEM: Simple password hash
      if (!newPassword) {
        return NextResponse.json(
          { error: "newPassword is required" },
          { status: 400, headers: withCORS(request) },
        );
      }

      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters" },
          { status: 400, headers: withCORS(request) },
        );
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
      });

      return NextResponse.json(
        {
          success: true,
          message: "Password reset successfully",
        },
        { headers: withCORS(request) },
      );
    }
  } catch (err) {
    console.error("reset-password error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
