import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Get all saved shares for this user
    const savedShares = await (prisma.savedShare as any).findMany({
      where: { savedBy: userId },
      orderBy: { savedAt: "desc" },
    });

    return NextResponse.json(
      { savedShares },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[shares/saved] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve saved files" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
