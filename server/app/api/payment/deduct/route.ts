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
    const { userId, amount, description } = body;

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

    // Get current user balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { balance: true, username: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Check if user has sufficient balance
    if (user.balance < amount) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Deduct amount from user balance
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        balance: {
          decrement: amount
        }
      },
      select: {
        id: true,
        username: true,
        balance: true,
      }
    });

    console.log(`💸 Deducted $${amount} from ${updatedUser.username}'s account. New balance: $${updatedUser.balance}${description ? ` (${description})` : ''}`);

    return NextResponse.json(
      {
        message: "Payment processed successfully",
        balance: updatedUser.balance,
        deducted: amount,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Deduct payment error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process payment" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
