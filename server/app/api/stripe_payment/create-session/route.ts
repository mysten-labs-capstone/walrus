import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";

// Used Emojis: 💬 ❗

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-11-17.clover",
});

export async function POST(req: NextRequest) {
  try {
    const { userId, priceId } = await req.json();

    if (!userId || !priceId) {
      return NextResponse.json(
        { error: "Missing userId or amount" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
      },
      success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error("❗ Stripe session error:", error);
    return NextResponse.json(
      { error: "Failed to create Stripe session" },
      { status: 500 }
    );
  }
}
