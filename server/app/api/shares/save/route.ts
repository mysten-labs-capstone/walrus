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
    const { shareId, userId } = body;

    if (!shareId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: withCORS(req) },
      );
    }

    const share = await prisma.share.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: {
            filename: true,
            originalSize: true,
            contentType: true,
            userId: true,
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    if (share.revokedAt) {
      return NextResponse.json(
        { error: "Share has been revoked" },
        { status: 410, headers: withCORS(req) },
      );
    }

    if (share.expiresAt && share.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Share has expired" },
        { status: 410, headers: withCORS(req) },
      );
    }

    // Prevent users from saving their own file via their own share link.
    // (Even though the file already exists in their account, this avoids confusing duplicates.)
    if (share.file.userId === userId) {
      return NextResponse.json(
        {
          error:
            "You can't save your own file from your own share link. This file is already in your account.",
        },
        { status: 403, headers: withCORS(req) },
      );
    }

    const savedShareDelegate = (prisma as any).savedShare;
    if (!savedShareDelegate) {
      return NextResponse.json(
        { error: "Server misconfiguration: SavedShare model is not available" },
        { status: 500, headers: withCORS(req) },
      );
    }

    // Check if already saved (by shareId)
    const existingSaved = await savedShareDelegate.findUnique({
      where: {
        userId_shareId: {
          userId,
          shareId,
        },
      },
    });

    if (existingSaved) {
      return NextResponse.json(
        {
          id: existingSaved.id,
          shareId: existingSaved.shareId,
          filename: existingSaved.filename,
          savedAt: existingSaved.savedAt,
          message: "Already saved",
        },
        { status: 200, headers: withCORS(req) },
      );
    }

    // Check if this file (blobId) is already saved through a different share link
    const existingBlobSaved = await savedShareDelegate.findFirst({
      where: {
        userId,
        blobId: share.blobId,
      },
    });

    if (existingBlobSaved) {
      return NextResponse.json(
        {
          id: existingBlobSaved.id,
          shareId: existingBlobSaved.shareId,
          filename: existingBlobSaved.filename,
          savedAt: existingBlobSaved.savedAt,
          message: "This file is already saved",
        },
        { status: 200, headers: withCORS(req) },
      );
    }

    const uploader = await prisma.user.findUnique({
      where: { id: share.file.userId },
      select: { username: true },
    });

    const savedShare = await savedShareDelegate.create({
      data: {
        shareId,
        blobId: share.blobId,
        filename: share.file.filename,
        originalSize: share.file.originalSize,
        contentType: share.file.contentType || null,
        uploadedBy: share.file.userId,
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
      { status: 201, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[POST /api/shares/save] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save share" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
