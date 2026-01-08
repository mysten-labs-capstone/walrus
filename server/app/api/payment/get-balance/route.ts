import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        balance: true,
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    return NextResponse.json(
      {
        userId: user.id,
        username: user.username,
        balance: user.balance,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Get balance error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to get balance" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
