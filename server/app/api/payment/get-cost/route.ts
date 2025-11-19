import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { suiToUSD } from "@/utils/priceConverter";

export const runtime = "nodejs";

// Cost calculation based on file size
// Walrus storage costs approximately 0.001 SUI per GB per epoch
// We use 3 epochs = 90 days storage
const SUI_COST_PER_GB_PER_EPOCH = 0.001; // SUI
const EPOCHS = 3;
const BYTES_PER_GB = 1024 * 1024 * 1024;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileSize } = body; // File size in bytes

    if (!fileSize || fileSize <= 0) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Calculate cost in SUI
    const sizeInGB = fileSize / BYTES_PER_GB;
    const costInSui = sizeInGB * SUI_COST_PER_GB_PER_EPOCH * EPOCHS;
    
    // Convert SUI cost to USD
    const costInUSD = await suiToUSD(costInSui);
    
    // Minimum cost of $0.01
    const finalCost = Math.max(0.01, costInUSD);

    console.log(`💰 Upload cost for ${(fileSize / (1024 * 1024)).toFixed(2)} MB: ${costInSui.toFixed(10)} SUI = $${finalCost.toFixed(4)} USD`);

    return NextResponse.json(
      {
        fileSize,
        sizeInMB: (fileSize / (1024 * 1024)).toFixed(2),
        sizeInGB: sizeInGB.toFixed(4),
        costSUI: parseFloat(costInSui.toFixed(10)),
        costUSD: parseFloat(finalCost.toFixed(4)),
        epochs: EPOCHS,
        storageDays: EPOCHS * 30,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Cost calculation error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to calculate cost" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
