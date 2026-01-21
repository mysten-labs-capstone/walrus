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

    let user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        // privateKey removed - E2E encryption
        createdAt: true,
        _count: {
          select: { files: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(request) },
      );
    }

    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        fileCount: user._count.files,
      },
      { headers: withCORS(request) },
    );
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: withCORS(request) },
    );
  }
}
