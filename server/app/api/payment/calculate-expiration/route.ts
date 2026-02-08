import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { calculateExpirationDate, formatExpirationDate, getCurrentEpochInfo, getDaysUntilExpiration } from "@/utils/epochService";

export async function POST(req: Request) {
  try {
    const { epochs } = await req.json();

    if (!epochs || epochs < 1) {
      return NextResponse.json(
        { error: "Invalid epochs parameter" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const epochInfo = await getCurrentEpochInfo();
    const expirationDate = await calculateExpirationDate(epochs, epochInfo);
    const daysUntilExpiration = getDaysUntilExpiration(expirationDate);
    const formattedDate = formatExpirationDate(expirationDate);
    const epochDays = Math.round(epochInfo.epochDurationMs / (24 * 60 * 60 * 1000));

    return NextResponse.json(
      {
        expiresAt: expirationDate.toISOString(),
        formattedDate,
        daysUntilExpiration,
        epochs,
        epochDays,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (error: any) {
    console.error("Error calculating expiration:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to calculate expiration date" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
