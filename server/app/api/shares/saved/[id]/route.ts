import { NextResponse } from "next/server";
import prisma from "../../../_utils/prisma";
import { withCORS } from "../../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get the saved share
    const savedShare = await (prisma.savedShare as any).findUnique({
      where: { id: params.id },
    });

    if (!savedShare) {
      return NextResponse.json(
        { error: "Saved share not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Verify the user owns this saved share
    if (savedShare.savedBy !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Update last accessed time
    await (prisma.savedShare as any).update({
      where: { id: params.id },
      data: { lastAccessedAt: new Date() },
    });

    return NextResponse.json(savedShare, {
      status: 200,
      headers: withCORS(req),
    });
  } catch (err: any) {
    console.error("[shares/saved/[id]] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve saved file" },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get the saved share
    const savedShare = await (prisma.savedShare as any).findUnique({
      where: { id: params.id },
    });

    if (!savedShare) {
      return NextResponse.json(
        { error: "Saved share not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Verify the user owns this saved share
    if (savedShare.savedBy !== userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Delete the saved share
    await (prisma.savedShare as any).delete({
      where: { id: params.id },
    });

    return NextResponse.json(
      { message: "Saved share deleted successfully" },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[shares/saved/[id]] Delete error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to delete saved file" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
