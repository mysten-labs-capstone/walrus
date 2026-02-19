import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { suiToUSD } from "@/utils/priceConverter";
import { getCurrentEpochInfo } from "@/utils/epochService";

export const runtime = "nodejs";

// Cost calculation based on file size
// Walrus uses dual payment:
// 1. Storage fee: 1000 MIST per MB per epoch (paid in WAL)
// 2. Gas fee: Transaction execution cost (paid in SUI)
// Small files: ~0.001 SUI + 0.001 WAL = 0.002 SUI total
// Large files (>10MB): additional gas overhead scales with size
// We use 3 epochs = 90 days storage
const MIST_PER_MB_PER_EPOCH = 1000; // Base storage cost
const MIN_STORAGE_COST_MIST = 1_000_000; // 0.001 SUI minimum
const BASE_GAS_OVERHEAD = 0.0; // No fixed overhead - gas scales with storage
const GAS_PER_MB = 0.0005; // Gas increases slightly with file size
const EPOCHS = 3;
const MIST_PER_SUI = 1_000_000_000;
const MAX_EPOCHS = 53;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileSize, epochs } = body; // File size in bytes and optional epochs

    if (!fileSize || fileSize <= 0) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Use provided epochs or default to 3
    const numEpochs = epochs && epochs > 0 ? epochs : EPOCHS;

    if (numEpochs > MAX_EPOCHS) {
      return NextResponse.json(
        { error: `Maximum storage duration is ${MAX_EPOCHS} epochs` },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Calculate storage cost (matches CLI script logic)
    const sizeInMB = fileSize / (1024 * 1024);
    const storageCostMist = Math.max(
      Math.ceil(sizeInMB * MIST_PER_MB_PER_EPOCH * numEpochs),
      MIN_STORAGE_COST_MIST
    );
    const storageCostSui = storageCostMist / MIST_PER_SUI;
    
    // Total: storage (SUI) + storage (WAL, shown as SUI) + variable gas
    const walEquivalent = storageCostSui; // WAL cost same as storage cost
    const gasOverhead = BASE_GAS_OVERHEAD + (sizeInMB * GAS_PER_MB);
    const costInSui = storageCostSui + walEquivalent + gasOverhead;
    
    // Convert SUI cost to USD
    const costInUSD = await suiToUSD(costInSui);
    
    // Minimum cost of $0.01
    const finalCost = Math.max(0.01, costInUSD);

    console.log(`${epochs ? 'Extension' : 'Upload'} cost for ${(fileSize / (1024 * 1024)).toFixed(2)} MB (${numEpochs} epochs): ${costInSui.toFixed(10)} SUI = $${finalCost.toFixed(4)} USD`);

    const epochInfo = await getCurrentEpochInfo();
    const storageDays = Math.round(
      (epochInfo.epochDurationMs * numEpochs) / (24 * 60 * 60 * 1000)
    );

    return NextResponse.json(
      {
        fileSize,
        sizeInMB: sizeInMB.toFixed(2),
        sizeInGB: (fileSize / (1024 * 1024 * 1024)).toFixed(4),
        costSUI: parseFloat(costInSui.toFixed(8)), // Reduced precision, parseFloat removes trailing zeros
        costUSD: parseFloat(finalCost.toFixed(4)),
        epochs: numEpochs,
        storageDays,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("Cost calculation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to calculate cost" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
