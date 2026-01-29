import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  const headers = withCORS(req);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(null, { status: 204, headers });
}

/**
 * POST /api/shares/save
 * Save a shared file link to the user's "Saved Shares" collection
 *
 * UPDATED: Testing 405 fix - v2
 */
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
        { error: "Missing required fields: shareId, blobId, filename, uploadedBy, userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Verify the share exists
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

    // Get uploader's username for display
    const uploader = await prisma.user.findUnique({
      where: { id: uploadedBy },
      select: { username: true },
    });

    // Create the saved share record
    const savedShare = await (prisma.savedShare as any).create({
      data: {
        shareId,
        blobId,
        filename,
        originalSize,
        contentType: contentType || null,
        uploadedBy,
        uploadedByUsername: uploader?.username || "Unknown",
        savedBy: userId,
      },
    });

    console.log(
      `[SAVE SHARE] User ${userId} saved share ${shareId} (blob ${blobId})`
    );

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
