import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        encryptedMasterKey: true,
        encryptedRecoveryPhrase: true,
        salt: true,
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

    // Return user data (excluding sensitive hashes in response, but including encrypted data)
    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        encryptedMasterKey: user.encryptedMasterKey,
        encryptedRecoveryPhrase: user.encryptedRecoveryPhrase,
        salt: user.salt,
        hasNewAuth: !!user.authKeyHash,
        hasOldAuth: !!user.passwordHash,
      },
      { headers: withCORS(request) },
    );
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
