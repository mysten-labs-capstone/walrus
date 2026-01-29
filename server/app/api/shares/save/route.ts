import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      shareId,
      blobId,
      filename,
      originalSize,
      contentType,
      uploadedBy,
      userId,
    } = body;

    if (!shareId || !blobId || !filename || !uploadedBy || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const share = await prisma.share.findUnique({
      where: { id: shareId },
      select: { id: true, revokedAt: true, expiresAt: true },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    if (share.revokedAt) {
      return NextResponse.json(
        { error: "Share has been revoked" },
        { status: 410, headers: withCORS(req) }
      );
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Share has expired" },
        { status: 410, headers: withCORS(req) }
      );
    }

    const uploader = await prisma.user.findUnique({
      where: { id: uploadedBy },
      select: { username: true },
    });

    const savedShare = await (prisma.savedShare as any).create({
      data: {
        shareId,
        blobId,
        filename,
        originalSize,
        contentType: contentType || null,
        uploadedBy,
        uploadedByUsername: uploader?.username || "Unknown",
        userId,
      },
    });

    return NextResponse.json(
      {
        id: savedShare.id,
        shareId: savedShare.shareId,
        filename: savedShare.filename,
        savedAt: savedShare.savedAt,
      },
      { status: 201, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[POST /api/shares/save] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save share" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
