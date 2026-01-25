import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import {
  hashPassword,
  verifyPassword,
  hashAuthKey,
  verifyAuthKey,
} from "../../_utils/password";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      oldPassword,
      newPassword,
      newAuthKey,
      newSalt,
      newEncryptedMasterKey,
    } = await request.json();

    if (!userId || !oldPassword || !newPassword) {
      return NextResponse.json(
        { error: "userId, oldPassword, and newPassword are required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        authKeyHash: true,
        salt: true,
        encryptedMasterKey: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(request) },
      );
    }

    // Determine if user has new auth system
    const hasNewAuth = !!user.authKeyHash;

    if (hasNewAuth) {
      // NEW AUTH SYSTEM: Change password with key derivation
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

      // Note: We don't verify old password on server since client already did it
      // Client derives old keys, decrypts master key, then re-encrypts with new keys
      // This approach maintains zero-knowledge architecture

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
          message: "Password changed successfully",
        },
        { headers: withCORS(request) },
      );
    } else {
      // OLD AUTH SYSTEM: Simple password hash verification
      if (!user.passwordHash) {
        return NextResponse.json(
          { error: "Invalid authentication method" },
          { status: 401, headers: withCORS(request) },
        );
      }

      // Verify old password
      const isValid = await verifyPassword(oldPassword, user.passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 401, headers: withCORS(request) },
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
          message: "Password changed successfully",
        },
        { headers: withCORS(request) },
      );
    }
  } catch (error) {
    console.error("Password change error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
