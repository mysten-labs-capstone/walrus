import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { calculateCost } from "@/utils/paymentCost";
export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { fileSize, epochs } = body as { fileSize: number; epochs?: number };

    const result = await calculateCost({ fileSize, epochs });

    return NextResponse.json(result, { status: 200, headers: withCORS(req) });
  } catch (err: any) {
    console.error("Cost calculation error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to calculate cost" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
