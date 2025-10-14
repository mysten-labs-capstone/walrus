// backend/app/api/balance/route.ts
import { NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({ status: "placeholder for balance" });
}
