import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";

/**
 * Walrus Mainnet pricing (from `walrus --context mainnet info`)
 * - Storage unit: 1 MiB
 * - Price per encoded storage unit: 11,000 FROST
 * - Marginal price per additional 1 MiB unencoded (w/o metadata): 66,000 FROST
 * - Price to store metadata: 0.0007 WAL
 * - Additional price for each write: 20,000 FROST
 * - 1 WAL = 1,000,000,000 FROST
 * - 1 epoch = 14 days (max = 53 epochs in the future)
 *
 * NOTE: These constants are MAINNET-specific.
 */

export const runtime = "nodejs";

// 25% markup for for profit ;)
const PROFIT_MARKUP = 0.25;
const MARKUP_MULTIPLIER = 1 + PROFIT_MARKUP;

// Units
const BYTES_PER_MIB = 1024 * 1024;
const FROST_PER_WAL = 1_000_000_000;

// Walrus mainnet costs (per epoch)
const METADATA_WAL_PER_EPOCH = 0.0007; // WAL
const WRITE_FROST_PER_EPOCH = 20_000; // FROST
const MARGINAL_FROST_PER_MIB_UNENCODED_PER_EPOCH = 66_000; // FROST (given directly by walrus info)

// Fetch prices from /api/price/route.ts
async function getPrices() {
  try {
    const base =
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.VERCEL_URL?.startsWith("http")
        ? process.env.VERCEL_URL
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "";

    const res = await fetch(`${base}/api/price`, { cache: "no-store" });
    if (!res.ok) return { sui: null as number | null, wal: null as number | null };
    const data = await res.json();
    return {
      sui: typeof data?.sui === "number" ? data.sui : null,
      wal: typeof data?.wal === "number" ? data.wal : null,
    };
  } catch {
    return { sui: null as number | null, wal: null as number | null };
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileSize, epochs } = body as { fileSize: number; epochs?: number };

    if (!fileSize || fileSize <= 0) {
      return NextResponse.json(
        { error: "Invalid file size" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const numEpochs = typeof epochs === "number" && epochs > 0 ? epochs : 3;

    // Walrus bills in 1 MiB storage units
    const sizeMiBExact = fileSize / BYTES_PER_MIB;
    const sizeMiBUnits = Math.max(1, Math.ceil(sizeMiBExact)); // minimum 1 MiB unit

    // WAL cost per epoch:
    // - metadata WAL per epoch
    // - write fee per epoch (FROST)
    // - marginal storage per MiB per epoch (FROST)
    const metadataFrostPerEpoch = Math.round(METADATA_WAL_PER_EPOCH * FROST_PER_WAL);
    const marginalFrostPerEpoch = sizeMiBUnits * MARGINAL_FROST_PER_MIB_UNENCODED_PER_EPOCH;

    const totalFrostPerEpoch =
      metadataFrostPerEpoch + WRITE_FROST_PER_EPOCH + marginalFrostPerEpoch;

    const walPerEpoch = totalFrostPerEpoch / FROST_PER_WAL;
    const walTotal = walPerEpoch * numEpochs;

    // Apply 25% markup (profit)
    const walTotalWithMarkup = walTotal * MARKUP_MULTIPLIER;

    // USD conversion
    const { sui, wal } = await getPrices();
    const walUsd = wal != null ? wal : null;

    const usdBase =
      walUsd != null ? walTotal * walUsd : null;

    const usdWithMarkup =
      walUsd != null ? walTotalWithMarkup * walUsd : null;

    console.log(
      `Walrus mainnet cost: ${sizeMiBUnits} MiB units, ${numEpochs} epochs => ` +
        `${walTotal.toFixed(8)} WAL (base), ${walTotalWithMarkup.toFixed(8)} WAL (markup)`
    );

    return NextResponse.json(
      {
        fileSizeBytes: fileSize,
        sizeMiBExact: Number(sizeMiBExact.toFixed(4)),
        sizeMiBUnits,
        epochs: numEpochs,

        // WAL
        wal: {
          perEpoch: Number(walPerEpoch.toFixed(10)),
          total: Number(walTotal.toFixed(10)),
          totalWithMarkup: Number(walTotalWithMarkup.toFixed(10)),
          breakdownFrostPerEpoch: {
            metadata: metadataFrostPerEpoch,
            write: WRITE_FROST_PER_EPOCH,
            marginalStorage: marginalFrostPerEpoch,
          },
        },

        // USD
        usd: walUsd != null
          ? {
              walPriceUsd: walUsd,
              base: Number(usdBase!.toFixed(4)),
              withMarkup: Number(usdWithMarkup!.toFixed(4)),
            }
          : {
              walPriceUsd: null,
              base: null,
              withMarkup: null,
              note: "WAL USD price unavailable; add it to /api/price to enable USD totals.",
            },

        // sui price
        suiPriceUsd: sui,
        profitMarkup: PROFIT_MARKUP,
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
