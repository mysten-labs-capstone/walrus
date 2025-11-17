import { NextResponse } from "next/server";
import { storeFileMetadata } from "@/utils/passwordStore";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { blobId, password, filename } = body;

    if (!blobId || !password) {
      return NextResponse.json(
        { error: "Missing blobId or password" },
        { status: 400, headers: withCORS(req) }
      );
    }

    await storeFileMetadata(blobId, password, filename);

    return NextResponse.json(
      { message: "Password stored successfully" },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Password store error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}
