import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { getSuiPriceUSD, getWalPriceUSD } from "@/utils/priceConverter";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

// Same pricing constants
const BYTES_PER_MIB = 1024 * 1024;
const FROST_PER_WAL = 1_000_000_000;
const ENCODED_MULTIPLIER = 7;
const METADATA_WAL_PER_EPOCH = 0.0007;
const MARGINAL_FROST_PER_MIB_PER_EPOCH = 66_000;
const SUI_TX = 0.005;
const PROFIT_MARKUP = 0.25;
const MARKUP_MULTIPLIER = 1 + PROFIT_MARKUP;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, blobId, additionalEpochs } = body; // REMOVED fileSize from here

    if (!userId || !blobId || !additionalEpochs) {
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

    // Get file record with size
    const fileRecord = await prisma.file.findFirst({
      where: { blobId, userId },
      select: { 
        blobObjectId: true, 
        epochs: true,
        originalSize: true  // ADDED THIS
      }
    });

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    const fileSize = fileRecord.originalSize; // GET fileSize from database

    // Calculate cost
    const encodedSize = fileSize * ENCODED_MULTIPLIER;
    const sizeMiBExact = encodedSize / BYTES_PER_MIB;
    const sizeMiBUnits = Math.max(1, Math.ceil(sizeMiBExact));
    
    const metadataFrostPerEpoch = Math.round(METADATA_WAL_PER_EPOCH * FROST_PER_WAL);
    const marginalFrostPerEpoch = sizeMiBUnits * MARGINAL_FROST_PER_MIB_PER_EPOCH;
    const totalFrostPerEpoch = metadataFrostPerEpoch + marginalFrostPerEpoch;

    const walPerEpoch = totalFrostPerEpoch / FROST_PER_WAL;
    const walTotal = walPerEpoch * additionalEpochs;

    // Get current prices
    const [sui, wal] = await Promise.all([
      getSuiPriceUSD(),
      getWalPriceUSD()
    ]);

    const suiTxUSD = SUI_TX * sui;
    const walUSD = wal * walTotal;
    const totalUSD = walUSD + suiTxUSD;

    const finalCost = Math.max(0.01, MARKUP_MULTIPLIER * totalUSD);
    console.log(`--> Cost of time-extension: ${finalCost}, size: ${sizeMiBUnits}, totalUSD: ${totalUSD}`);

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

    // Check epoch limits
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

    // Extend on Walrus network if we have the object ID
    let walrusExtended = false;
    
    if (fileRecord.blobObjectId) {
      try {
        const { initWalrus } = await import("@/utils/walrusClient");
        const { walrusClient, signer, suiClient } = await initWalrus();
        
        console.log(`Extending blob object ${fileRecord.blobObjectId} by ${additionalEpochs} epochs (current: ${currentEpochs}, new total: ${newTotalEpochs})...`);
        
        const tx = await walrusClient.extendBlobTransaction({
          blobObjectId: fileRecord.blobObjectId,
          epochs: additionalEpochs,
        });
        
        const result = await signer.signAndExecuteTransaction({
          transaction: tx as any,
          client: suiClient as any,
        });
        
        walrusExtended = true;
        console.log(`Successfully extended blob ${blobId} on Walrus network. Transaction: ${result.digest}`);
      } catch (err: any) {
        console.error(`Failed to extend blob on Walrus network:`, err);
        walrusExtended = false;
      }
    } else {
      console.warn(`No blobObjectId for ${blobId} - cannot extend on Walrus network. Database only update.`);
    }

    // Deduct cost and update file epochs
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

    console.log(`Extended storage for blob ${blobId} by ${additionalEpochs} epochs for ${user.username}. Cost: $${finalCost.toFixed(4)}. New balance: $${updatedUser.balance}. Walrus extended: ${walrusExtended}`);

    return NextResponse.json(
      {
        success: true,
        costUSD: Number(finalCost.toFixed(4)),
        costSUI: parseFloat((finalCost / sui).toFixed(8)),
        additionalEpochs,
        totalEpochs: newTotalEpochs,
        additionalDays: additionalEpochs * 14,
        newBalance: updatedUser.balance,
        walrusExtended,
        message: walrusExtended 
          ? `Storage extended by ${additionalEpochs} epochs (${additionalEpochs * 14} days) on Walrus network`
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