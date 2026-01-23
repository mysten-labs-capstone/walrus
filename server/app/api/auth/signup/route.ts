import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { hashPassword, validatePassword } from "../../_utils/password";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  try {
    const { username, password, encryptedRecoveryPhrase } =
      await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Normalize username to lowercase to prevent case-sensitive duplicates
    const normalizedUsername = username.toLowerCase();

    if (normalizedUsername.length < 3 || normalizedUsername.length > 30) {
      return NextResponse.json(
        { error: "Username must be 3-30 characters" },
        { status: 400, headers: withCORS(request) },
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
      return NextResponse.json(
        {
          error:
            "Username can only contain letters, numbers, hyphens, and underscores",
        },
        { status: 400, headers: withCORS(request) },
      );
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        {
          error: "Password does not meet requirements",
          details: passwordValidation.errors,
        },
        { status: 400, headers: withCORS(request) },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409, headers: withCORS(request) },
      );
    }

    // E2E Encryption: Private key derived client-side from recovery phrase
    // Server stores encrypted recovery phrase (encrypted with password-derived key)
    // Server never sees or stores the plaintext recovery phrase or encryption key
    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        encryptedRecoveryPhrase: encryptedRecoveryPhrase || null,
      },
      select: {
        id: true,
        username: true,
        encryptedRecoveryPhrase: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { success: true, user },
      { status: 201, headers: withCORS(request) },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error during signup" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
