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

    // Simple pricing: $0.01 USD per epoch (30 days)
    const finalCost = 0.01 * additionalEpochs;

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

    // Get the file record to check if we have blobObjectId
    const fileRecord = await prisma.file.findFirst({
      where: { blobId, userId },
      select: { blobObjectId: true, epochs: true }
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Extend on Walrus network if we have the object ID
    // Note: Blobs can be stored for at most 53 epochs in advance
    let walrusExtended = false;
    
    if (fileRecord.blobObjectId) {
      // Check if total epochs would exceed 53
      const currentEpochs = fileRecord.epochs || 3;
      const newTotalEpochs = currentEpochs + additionalEpochs;
      
      if (newTotalEpochs > 53) {
        return NextResponse.json(
          { 
            error: "Cannot extend beyond 53 epochs maximum",
            current: currentEpochs,
            requested: additionalEpochs,
            total: newTotalEpochs,
            maximum: 53
          },
          { status: 400, headers: withCORS(req) }
        );
      }
      
      try {
        // Dynamic import to avoid build-time issues
        const { initWalrus } = await import("@/utils/walrusClient");
        const { walrusClient, signer } = await initWalrus();
        
        console.log(`Extending blob object ${fileRecord.blobObjectId} by ${additionalEpochs} epochs (current: ${currentEpochs}, new total: ${newTotalEpochs})...`);
        
        // Build the extend transaction
        const tx = await walrusClient.extendBlobTransaction({
          blobObjectId: fileRecord.blobObjectId,
          epochs: additionalEpochs,
        });
        
        // Sign and execute using the signer's method directly
        const result = await signer.signAndExecuteTransaction({
          transaction: tx as any, // Type assertion to bypass version mismatch
        });
        
        walrusExtended = true;
        console.log(`Successfully extended blob ${blobId} on Walrus network. Transaction: ${result.digest}`);
      } catch (err: any) {
        console.error(`Failed to extend blob on Walrus network:`, err);
        // Continue anyway - we'll still track it in the database
        walrusExtended = false;
      }
    } else {
      console.warn(`No blobObjectId for ${blobId} - cannot extend on Walrus network. Database only update.`);
    }

    // Deduct the cost from user's balance and update file epochs
    const [updatedUser] = await prisma.$transaction([
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

    console.log(`Extended storage for blob ${blobId} by ${additionalEpochs} epochs for ${user.username}. Cost: $${finalCost}. New balance: $${updatedUser.balance}. Walrus extended: ${walrusExtended}`);

    const currentEpochs = fileRecord.epochs || 3;
    const newTotalEpochs = currentEpochs + additionalEpochs;

    return NextResponse.json(
      {
        success: true,
        costUSD: finalCost,
        costSUI: finalCost,
        additionalEpochs,
        totalEpochs: newTotalEpochs,
        additionalDays: additionalEpochs * 30,
        newBalance: updatedUser.balance,
        walrusExtended,
        message: walrusExtended 
          ? `Storage extended by ${additionalEpochs} epochs (${additionalEpochs * 30} days) on Walrus network`
          : `Payment recorded. Note: Blob object ID not available for network extension.`
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
