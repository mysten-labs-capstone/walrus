import Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import prisma from "../../_utils/prisma";


// Used Emojis: 💬 ❗

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2025-11-17.clover",
});



// Convert ReadableStream → Buffer
async function buffer(readable: ReadableStream<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  const reader = readable.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export async function POST(req: NextRequest) {
  const rawBody = await buffer(req.body!);
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("❗ Webhook signature verification error:", err.message);
    return NextResponse.json(
      { error: `Webhook signature verification failed.` },
      { status: 400 }
    );
  }

  // Handle Stripe events
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.userId;
        const amount = session.amount_total / 100; // amount paid in cents --> dollar

        console.log("💬 Payment Completed!");
        console.log("💬 User:", userId);
        console.log("💬 Amount Paid:", amount);

        // Add balance update logic here
        if (!userId) {
          console.error("❗ Missing userId in metadata");
          break;
        }
      
        console.log(`💬 Adding $${amount} to user ${userId}`);
      
        // Update Prisma balance
        await prisma.user.update({
          where: { id: userId },
          data: { balance: { increment: amount } },
        });


        break;
      }

      default:
        console.log(`💬 Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("❗ Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook handling error" },
      { status: 500 }
    );
  }
}
