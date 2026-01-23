import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import {
  hashPassword,
  validatePassword,
  hashAuthKey,
} from "../../_utils/password";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(request: NextRequest) {
  console.log("Signup endpoint hit");
  try {
    const body = await request.json();
    console.log("Request body received:", body);

    const {
      username,
      authKey,
      salt,
      encryptedMasterKey,
      // DEPRECATED: old flow for backward compatibility
      password,
      encryptedRecoveryPhrase,
    } = body;

    console.log("Signup request:", {
      username,
      hasAuthKey: !!authKey,
      authKeyLength: authKey?.length,
      hasSalt: !!salt,
      saltLength: salt?.length,
      hasEncryptedMasterKey: !!encryptedMasterKey,
      encryptedMasterKeyLength: encryptedMasterKey?.length,
      hasPassword: !!password,
    });

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
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

    const existingUser = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409, headers: withCORS(request) },
      );
    }

    let authKeyHash: string | undefined;
    let userSalt: string | undefined;
    let userEncryptedMasterKey: string | undefined;
    let passwordHash: string | undefined;
    let userEncryptedRecoveryPhrase: string | undefined;

    // NEW FLOW: ProtonMail-style encryption with Argon2id + HKDF
    if (authKey && salt) {
      // Validate auth_key format (should be 64-char hex string)
      if (!/^[0-9a-f]{64}$/i.test(authKey)) {
        return NextResponse.json(
          { error: "Invalid auth key format" },
          { status: 400, headers: withCORS(request) },
        );
      }

      // Validate salt format (should be 64-char hex string)
      if (!/^[0-9a-f]{64}$/i.test(salt)) {
        return NextResponse.json(
          { error: "Invalid salt format" },
          { status: 400, headers: withCORS(request) },
        );
      }

      // Hash the auth_key for storage (server never sees password)
      authKeyHash = await hashAuthKey(authKey);
      userSalt = salt;
      userEncryptedMasterKey = encryptedMasterKey;
    }
    // OLD FLOW: Backward compatibility (deprecated)
    else if (password) {
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
      passwordHash = await hashPassword(password);
      userEncryptedRecoveryPhrase = encryptedRecoveryPhrase || null;
    } else {
      return NextResponse.json(
        { error: "Either authKey/salt or password must be provided" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Create user with new or old flow fields
    const user = await prisma.user.create({
      data: {
        username: normalizedUsername,
        authKeyHash,
        salt: userSalt,
        encryptedMasterKey: userEncryptedMasterKey,
        passwordHash,
        encryptedRecoveryPhrase: userEncryptedRecoveryPhrase,
      },
      select: {
        id: true,
        username: true,
        encryptedMasterKey: true,
        encryptedRecoveryPhrase: true,
        salt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      { success: true, user },
      { status: 201, headers: withCORS(request) },
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { error: "Internal server error during signup" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
