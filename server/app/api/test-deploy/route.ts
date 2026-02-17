import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ 
    timestamp: new Date().toISOString(),
    message: "Deploy test successful - code updated!",
    commitId: "b2ab3fb"
  });
}
