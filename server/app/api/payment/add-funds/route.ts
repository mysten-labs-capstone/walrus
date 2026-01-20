import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, amount } = body;

    if (!userId || !amount) {
      return NextResponse.json(
        { error: "Missing userId or amount" },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be positive" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Update user balance
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          increment: amount
        }
      },
      select: {
        id: true,
        username: true,
        balance: true,
      }
    });

    console.log(`💰 Added $${amount} to ${user.username}'s account. New balance: $${user.balance}`);

    // Record transaction
    try {
      await prisma.transaction.create({
        data: {
          userId: user.id,
          amount: amount,
          type: 'credit',
          description: 'Add funds',
          balanceAfter: user.balance,
        }
      });
    } catch (txErr: any) {
      console.error('Failed to create transaction record for add-funds:', txErr);
    }

    return NextResponse.json(
      {
        message: "Funds added successfully",
        balance: user.balance,
        added: amount,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Add funds error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to add funds" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
