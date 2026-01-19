import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * POST /api/shares
 * Create a new share link for a file
 * 
 * Security: fileKey is NEVER sent to server - only in URL fragment client-side
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { blobId, userId, expiresAt, maxDownloads } = body;

    if (!blobId || !userId) {
      return NextResponse.json(
        { error: "Missing blobId or userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Verify file exists and user owns it
    const file = await prisma.file.findUnique({
      where: { blobId },
      select: { id: true, userId: true, blobId: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    if (file.userId !== userId) {
      return NextResponse.json(
        { error: "Unauthorized - you don't own this file" },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Create share record
    const share = await prisma.share.create({
      data: {
        fileId: file.id,
        blobId: file.blobId,
        createdBy: userId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxDownloads: maxDownloads || null,
      },
    });

    console.log(`[CREATE SHARE] Created share ${share.id} for blob ${blobId} by user ${userId}`);

    return NextResponse.json(
      {
        shareId: share.id,
        blobId: share.blobId,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
        maxDownloads: share.maxDownloads,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[POST /api/shares] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create share" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
