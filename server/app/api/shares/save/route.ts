import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(null, { status: 204, headers });
}

export async function POST(req: Request) {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Content-Type", "application/json");
  
  try {
    const body = await req.json();
    return NextResponse.json(
      { message: "Endpoint is working", received: body },
      { status: 200, headers }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: "Test endpoint error", message: err.message },
      { status: 500, headers }
    );
  }
}
