import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";

// Used Emojis: 💬 ❗

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    // apiVersion: "2025-11-17.clover",
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session_id" },
        { status: 400 }
      );
    }

    // Retrieve Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const paymentStatus = session.payment_status; // "paid", "unpaid", etc.
    const amountTotal = session.amount_total;     // in cents
    const userId = session.metadata?.userId || null;


    if (paymentStatus === "paid" && userId && session.amount_total != null) {
      const amount = session.amount_total / 100; // cents -> dollars

      const existing = await prisma.transaction.findFirst({
        where: { reference: sessionId, userId, type: "credit" },
      });
      if (!existing) {
        const updatedUser = await prisma.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } },
        });
        try {
          await prisma.transaction.create({
            data: {
              userId,
              amount,
              currency: "USD",
              type: "credit",
              description: "Stripe payment",
              reference: sessionId,
              balanceAfter: updatedUser.balance,
            },
          });
        } catch (txErr: unknown) {
          console.error("Failed to create transaction record in verify-session:", txErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      paymentStatus,
      amountTotal,
      userId,
    });

  } catch (error: unknown) {
    console.error("❗ Error verifying session:", error);
    return NextResponse.json(
      { error: "Failed to verify Stripe session" },
      { status: 500 }
    );
  }
}
