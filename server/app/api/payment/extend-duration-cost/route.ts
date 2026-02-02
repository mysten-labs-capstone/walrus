import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { getSuiPriceUSD, getWalPriceUSD } from "@/utils/priceConverter";

export const runtime = "nodejs";

// Same pricing constants as extend-duration
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
    const { fileSize, additionalEpochs } = body;

    if (!fileSize || fileSize <= 0) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (!additionalEpochs || additionalEpochs <= 0) {
      return NextResponse.json(
        { error: "Invalid epochs" },
        { status: 400, headers: withCORS(req) }
      );
    }

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

    return NextResponse.json(
      {
        costUSD: Number(finalCost.toFixed(4)),
        costSUI: Number((finalCost / sui).toFixed(8)),
        additionalEpochs,
        additionalDays: additionalEpochs * 14,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("Cost calculation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to calculate cost" },
      { status: 500, headers: withCORS(req) }
    );
  }
}