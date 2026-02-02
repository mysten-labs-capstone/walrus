import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * PATCH handler to update file metadata (e.g., starred status)
 */
export async function PATCH(
  req: Request,
  { params }: { params: { blobId: string } },
) {
  try {
    const blobId = params.blobId;
    const body = await req.json();
    const { userId, starred } = body || {};

    if (!blobId || !userId) {
      return NextResponse.json(
        { error: "Missing blobId or userId" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (typeof starred === "boolean") {
      const file = await prisma.file.update({
        where: { blobId },
        data: { starred },
        select: { blobId: true, starred: true },
      });
      return NextResponse.json(file, { headers: withCORS(req) });
    }

    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("Cache PATCH error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}
