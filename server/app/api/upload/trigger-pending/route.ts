import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { processPendingFilesInternal } from "./internal";

export const runtime = "nodejs";

/**
 * HTTP endpoint wrapper
 */
async function processPendingFiles(req: Request) {
  const result = await processPendingFilesInternal();
  const status = (result as any).status || 200;
  return NextResponse.json(result, { status, headers: withCORS(req) });
}

export async function GET(req: Request) {
  return processPendingFiles(req);
}

export async function POST(req: Request) {
  return processPendingFiles(req);
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
