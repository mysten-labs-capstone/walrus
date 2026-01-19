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
    const limitParam = url.searchParams.get("limit");
    const skipParam = url.searchParams.get("skip");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const take = Math.min(100, parseInt(limitParam || '25', 10));
    const skip = Math.max(0, parseInt(skipParam || '0', 10));

    const transactions = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return NextResponse.json(
      { transactions },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('❗ Get transactions error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch transactions' },
      { status: 500, headers: withCORS(req) }
    );
  }
}
