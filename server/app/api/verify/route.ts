import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";

// Used Emojis: 💬 ❗

export const runtime = "nodejs";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { isValid: false, errors: ["Missing file"] },
        { status: 400, headers: withCORS(req) }
      );
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (file.size === 0) errors.push("File is empty");
    if (file.size > MAX_FILE_SIZE) errors.push("File too large (max 100MB)");

    const body = {
      isValid: errors.length === 0,
      errors,
      warnings,
      fileInfo: {
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      },
    };

    return NextResponse.json(body, {
      status: errors.length === 0 ? 200 : 400,
      headers: withCORS(req),
    });
  } catch (err) {
    return NextResponse.json(
      { isValid: false, errors: [(err as Error).message] },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function GET(req: Request) {
  return NextResponse.json({ status: "Verify route is alive" }, { headers: withCORS(req) });
}
