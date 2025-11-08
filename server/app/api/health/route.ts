import { NextResponse } from "next/server";

// Used Emojis: 💬 ❗

export async function GET() {
  return NextResponse.json({ status: "✅ Backend is running!" });
}