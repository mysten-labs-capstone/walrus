import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import { getSuiPriceUSD } from "../../../utils/priceConverter";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  try {
    const suiPrice = await getSuiPriceUSD();
    
    return NextResponse.json(
      {
        sui: suiPrice,
        timestamp: Date.now(),
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Price fetch error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch SUI price" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
