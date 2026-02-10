import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";
import { paymentQuoteStore } from "@/utils/paymentQuoteStore";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, quoteId, tempIds } = body as {
      userId?: string;
      quoteId?: string;
      tempIds?: string[];
    };

    if (!userId || !quoteId || !Array.isArray(tempIds)) {
      return NextResponse.json(
        { error: "Missing userId, quoteId, or tempIds" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const quote = paymentQuoteStore.getQuote(quoteId);
    if (!quote) {
      return NextResponse.json(
        { error: "Quote not found or expired" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (quote.userId !== userId) {
      return NextResponse.json(
        { error: "Quote does not belong to user" },
        { status: 403, headers: withCORS(req) },
      );
    }

    if (quote.expiresAtMs <= Date.now()) {
      return NextResponse.json(
        { error: "Quote expired" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const quoteTempIds = new Set(quote.perFile.map((file) => file.tempId));
    if (tempIds.length !== quoteTempIds.size) {
      return NextResponse.json(
        { error: "Temp ID list does not match quote" },
        { status: 400, headers: withCORS(req) },
      );
    }

    for (const tempId of tempIds) {
      if (!quoteTempIds.has(tempId)) {
        return NextResponse.json(
          { error: "Temp ID list does not match quote" },
          { status: 400, headers: withCORS(req) },
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (user.balance < quote.totalCostUSD) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400, headers: withCORS(req) },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        quoteId: quote.quoteId,
        totalCostUSD: quote.totalCostUSD,
        totalCostSUI: quote.totalCostSUI,
        expiresAt: new Date(quote.expiresAtMs).toISOString(),
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("Batch enqueue validation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to validate batch quote" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
