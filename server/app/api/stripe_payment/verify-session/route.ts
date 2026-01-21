import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

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

    return NextResponse.json({
      ok: true,
      sessionId,
      paymentStatus,
      amountTotal,
      userId,
    });

  } catch (error: any) {
    console.error("❗ Error verifying session:", error);
    return NextResponse.json(
      { error: "Failed to verify Stripe session" },
      { status: 500 }
    );
  }
}
