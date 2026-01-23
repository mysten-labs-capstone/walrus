import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * Get user's salt for client-side key derivation
 * This is a public endpoint - salt is not a secret
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get("username");

    if (!username) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400, headers: withCORS(request) },
      );
    }

    // Normalize username
    const normalizedUsername = username.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { username: normalizedUsername },
      select: {
        salt: true,
        authKeyHash: true,
      },
    });

    if (!user) {
      // Don't reveal if user exists or not (timing-safe)
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(request) },
      );
    }

    return NextResponse.json(
      {
        salt: user.salt,
        hasNewAuth: !!user.authKeyHash, // Indicates if user uses new auth system
      },
      { status: 200, headers: withCORS(request) },
    );
  } catch (error) {
    console.error("Get salt error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
