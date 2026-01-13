import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { suiToUSD } from "@/utils/priceConverter";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

// Cost calculation for extending storage duration
// Uses the same pricing model as initial upload
const MIST_PER_MB_PER_EPOCH = 1000;
const MIN_STORAGE_COST_MIST = 1_000_000; // 0.001 SUI minimum
const GAS_PER_MB = 0.0005;
const MIST_PER_SUI = 1_000_000_000;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, blobId, fileSize, additionalEpochs } = body;

    if (!userId || !blobId || !fileSize || !additionalEpochs) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (additionalEpochs <= 0) {
      return NextResponse.json(
        { error: "Additional epochs must be positive" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get user balance
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

    // Calculate cost for additional epochs
    const sizeInMB = fileSize / (1024 * 1024);
    const storageCostMist = Math.max(
      Math.ceil(sizeInMB * MIST_PER_MB_PER_EPOCH * additionalEpochs),
      MIN_STORAGE_COST_MIST
    );
    const storageCostSui = storageCostMist / MIST_PER_SUI;
    
    // Total cost includes storage and gas overhead
    const walEquivalent = storageCostSui;
    const gasOverhead = sizeInMB * GAS_PER_MB;
    const costInSui = storageCostSui + walEquivalent + gasOverhead;
    
    // Convert to USD
    const costInUSD = await suiToUSD(costInSui);
    const finalCost = Math.max(0.01, costInUSD);

    // Check if user has sufficient balance
    if (user.balance < finalCost) {
      return NextResponse.json(
        { 
          error: "Insufficient balance",
          required: finalCost,
          current: user.balance 
        },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Deduct the cost from user's balance and update file epochs
    const [updatedUser, updatedFile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          balance: {
            decrement: finalCost
          }
        },
        select: {
          id: true,
          username: true,
          balance: true,
        }
      }),
      prisma.file.updateMany({
        where: { blobId, userId },
        data: {
          epochs: {
            increment: additionalEpochs
          }
        }
      })
    ]);

    console.log(`Extended storage for blob ${blobId} by ${additionalEpochs} epochs for ${user.username}. Cost: $${finalCost}. New balance: $${updatedUser.balance}`);

    // Note: In a production system, this would also interact with the Walrus network
    // to extend the actual storage duration. For now, we just track the payment.

    return NextResponse.json(
      {
        success: true,
        costUSD: finalCost,
        costSUI: parseFloat(costInSui.toFixed(8)),
        additionalEpochs,
        additionalDays: additionalEpochs * 30,
        newBalance: updatedUser.balance,
        message: `Storage extended by ${additionalEpochs} epochs (${additionalEpochs * 30} days)`
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("Extend duration error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to extend storage duration" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
