import { NextResponse } from "next/server";
import { verifyFilePassword, isFileProtected } from "@/utils/passwordStore";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { blobId, password } = body;

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if file is protected
    const isProtected = await isFileProtected(blobId);
    
    if (!isProtected) {
      return NextResponse.json(
        { isProtected: false, isValid: true },
        { status: 200, headers: withCORS(req) }
      );
    }

    // If protected, verify password
    if (!password) {
      return NextResponse.json(
        { isProtected: true, isValid: false, error: "Password required" },
        { status: 401, headers: withCORS(req) }
      );
    }

    const isValid = await verifyFilePassword(blobId, password);

    return NextResponse.json(
      { isProtected: true, isValid },
      { status: isValid ? 200 : 401, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Password verify error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}
