import { NextResponse } from "next/server";
import { getCurrentEpochInfo } from "../../../../utils/epochService";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/config/epoch-duration
 * Returns the current epoch duration in days based on the network
 */
export async function GET(req: Request) {
  try {
    const epochInfo = await getCurrentEpochInfo();
    const daysPerEpoch = epochInfo.epochDurationMs / (24 * 60 * 60 * 1000);

    return NextResponse.json(
      {
        daysPerEpoch,
        epochDurationMs: epochInfo.epochDurationMs,
        currentEpochNumber: epochInfo.currentEpochNumber,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (error) {
    console.error("[config/epoch-duration] Error fetching epoch info:", error);
    // Fallback to testnet default (1 day)
    return NextResponse.json(
      {
        daysPerEpoch: 1,
        epochDurationMs: 1 * 24 * 60 * 60 * 1000,
        error: "Using fallback value",
      },
      { status: 200, headers: withCORS(req) }
    );
  }
}
