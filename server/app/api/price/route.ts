import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import { getSuiPriceUSD, getWalPriceUSD } from "../../../utils/priceConverter";


export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  try {
    // These functions have built-in fallbacks, so they always return a number
    const suiPrice = await getSuiPriceUSD();
    const walPrice = await getWalPriceUSD();
    
    return NextResponse.json(
      {
        sui: suiPrice,
        wal: walPrice,
        timestamp: Date.now(),
        warning: suiPrice === 1.85 || walPrice === 0.15 ? 'Using fallback prices due to API unavailability' : undefined,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    // This should never happen since getSuiPriceUSD/getWalPriceUSD have fallbacks
    // But if it does, return fallback prices instead of 500 error
    console.error("❗ Unexpected price fetch error:", err);
    return NextResponse.json(
      {
        sui: 1.85,
        wal: 0.15,
        timestamp: Date.now(),
        warning: 'Using fallback prices due to error',
      },
      { status: 200, headers: withCORS(req) }
    );
  }
}
