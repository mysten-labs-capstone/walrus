import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

// MARKUP
const PROFIT_MARKUP = 0.25;
const MARKUP_MULTIPLIER = 1 + PROFIT_MARKUP;

// --- WALRUS MAINNET PRICING (from `walrus --context mainnet info`) ---
// Units
const BYTES_PER_MIB = 1024 * 1024;
const FROST_PER_WAL = 1_000_000_000;

// Per-epoch pricing
const METADATA_WAL_PER_EPOCH = 0.0007;               // WAL
const WRITE_FROST_PER_EPOCH = 20_000;               // FROST
const MARGINAL_FROST_PER_MIB_PER_EPOCH = 66_000;    // FROST per 1 MiB (unencoded) per epoch

// Default epochs if not provided
const DEFAULT_EPOCHS = 3;

// Helper: build absolute base URL for server-side fetch API in price
function getSelfBaseUrl() {
  // On Vercel, VERCEL_URL is like "my-app.vercel.app" (no scheme)
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  // Local dev fallback
  return "http://localhost:3000";
}

async function fetchPrices() {
  const base = getSelfBaseUrl();
  const res = await fetch(`${base}/api/price`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch /api/price (${res.status})`);
  const data = await res.json();

  const sui = typeof data?.sui === "number" ? data.sui : null;
  const wal = typeof data?.wal === "number" ? data.wal : null;

  return { sui, wal };
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

    const numEpochs = typeof epochs === "number" && epochs > 0 ? epochs : DEFAULT_EPOCHS;

    // Walrus bills in 1 MiB storage units
    const sizeMiBExact = fileSize / BYTES_PER_MIB;
    const sizeMiBUnits = Math.max(1, Math.ceil(sizeMiBExact)); // minimum 1 MiB

    // Convert metadata WAL -> FROST (so everything can sum in FROST cleanly)
    const metadataFrostPerEpoch = Math.round(METADATA_WAL_PER_EPOCH * FROST_PER_WAL);

    // Total FROST per epoch = metadata + write fee + marginal storage
    const marginalFrostPerEpoch = sizeMiBUnits * MARGINAL_FROST_PER_MIB_PER_EPOCH;
    const totalFrostPerEpoch = metadataFrostPerEpoch + WRITE_FROST_PER_EPOCH + marginalFrostPerEpoch;

    const walPerEpoch = totalFrostPerEpoch / FROST_PER_WAL;
    const walTotal = walPerEpoch * numEpochs;

    // APPLY MARKUP
    const walTotalWithMarkup = walTotal * MARKUP_MULTIPLIER;

    // Fetch prices from /api/price
    const { sui, wal } = await fetchPrices();

    // WAL USD conversion (only if WAL price is available)
    const costUsdBase = wal != null ? walTotal * wal : null;
    const costUsdWithMarkup = wal != null ? walTotalWithMarkup * wal : null;

    return NextResponse.json(
      {
        fileSizeBytes: fileSize,
        sizeMiBExact: Number(sizeMiBExact.toFixed(4)),
        sizeMiBUnits,
        epochs: numEpochs,

        // WAL costs (grounded in walrus mainnet info)
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

        // USD totals (requires /api/price to return wal price)
        usd: wal != null
          ? {
              walPriceUsd: wal,
              base: Number(costUsdBase!.toFixed(4)),
              withMarkup: Number(costUsdWithMarkup!.toFixed(4)),
            }
          : {
              walPriceUsd: null,
              base: null,
              withMarkup: null,
              note: "WAL price unavailable from /api/price",
            },

        // Optional: include SUI price for UI display / later gas estimates
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
