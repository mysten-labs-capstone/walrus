import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { verifyPassword, verifyAuthKey } from "../../_utils/password";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  console.log("[LOGIN OPTIONS] Preflight request received");
  console.log("[LOGIN OPTIONS] Origin:", req.headers.get("origin"));
  const headers = withCORS(req);
  console.log(
    "[LOGIN OPTIONS] Response headers:",
    Object.fromEntries(headers.entries()),
  );
  return new Response(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  try {
    const { username, authKey, password } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Normalize username to lowercase for case-insensitive login
    const normalizedUsername = username.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401, headers: withCORS(request) },
      );
    }

    let isValid = false;

    // NEW FLOW: Verify with auth_key (ProtonMail-style)
    if (authKey && user.authKeyHash) {
      // Validate auth_key format
      if (!/^[0-9a-f]{64}$/i.test(authKey)) {
        return NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401, headers: withCORS(request) },
        );
      }
      isValid = await verifyAuthKey(authKey, user.authKeyHash);
    }
    // OLD FLOW: Verify with password (backward compatibility)
    else if (password && user.passwordHash) {
      isValid = await verifyPassword(password, user.passwordHash);
    } else {
      console.error("Login failed - Invalid authentication method:", {
        hasAuthKey: !!authKey,
        hasPassword: !!password,
        hasAuthKeyHash: !!user.authKeyHash,
        hasPasswordHash: !!user.passwordHash,
        username: normalizedUsername,
      });
      return NextResponse.json(
        { error: "Invalid authentication method" },
        { status: 401, headers: withCORS(request) },
      );
    }

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401, headers: withCORS(request) },
      );
    }

    // Return user data including encrypted master key
    return NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          encryptedMasterKey: user.encryptedMasterKey,
          encryptedRecoveryPhrase: user.encryptedRecoveryPhrase,
          salt: user.salt,
        },
      },
      { status: 200, headers: withCORS(request) },
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error during login" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
