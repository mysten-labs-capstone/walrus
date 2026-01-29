import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/shares/:shareId
 * Retrieve share information and check access policies
 * 
 * Returns blobId and policy status - recipient decrypts client-side with key from URL fragment
 */
export async function GET(
  req: Request,
  { params }: { params: { shareId: string } }
) {
  try {
    const { shareId } = params;

    if (!shareId) {
      return NextResponse.json(
        { error: "Missing shareId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const share = await prisma.share.findUnique({
      where: { id: shareId },
      include: {
        file: {
          select: {
            id: true,
            filename: true,
            originalSize: true,
            contentType: true,
            encrypted: true,
            userId: true,
            status: true,
          },
        },
      },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // In development, mark pending files as completed so they can be shared
    if (process.env.NODE_ENV !== "production" && share.file.status === "pending") {
      await prisma.file.update({
        where: { id: share.file.id },
        data: { status: "completed" },
      });
      share.file.status = "completed";
    }

    // Check if file is still being uploaded (only in production)
    if (process.env.NODE_ENV === "production" && share.file.status && share.file.status !== "completed") {
      return NextResponse.json(
        { 
          error: `File is still being uploaded to Walrus (status: ${share.file.status}). Please wait a moment and try again.`,
          uploading: true 
        },
        { status: 202, headers: withCORS(req) }
      );
    }

    // Check if share is revoked
    if (share.revokedAt) {
      return NextResponse.json(
        { error: "This share link has been revoked", revoked: true },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Check if share is expired
    if (share.expiresAt && new Date(share.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired", expired: true },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Check download limit
    if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
      return NextResponse.json(
        {
          error: "Download limit reached for this share link",
          limitReached: true,
        },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Increment download count
    await prisma.share.update({
      where: { id: shareId },
      data: { downloadCount: { increment: 1 } },
    });

    console.log(`[GET SHARE] Share ${shareId} accessed, download count: ${share.downloadCount + 1}`);

    return NextResponse.json(
      {
        shareId: share.id,
        blobId: share.blobId,
        filename: share.file.filename,
        size: share.file.originalSize,
        contentType: share.file.contentType,
        encrypted: share.file.encrypted,
        uploadedBy: share.file.userId,
        downloadCount: share.downloadCount + 1,
        maxDownloads: share.maxDownloads,
        expiresAt: share.expiresAt,
        createdAt: share.createdAt,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[GET /api/shares/:shareId] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve share" },
      { status: 500, headers: withCORS(req) }
    );
  }
}

/**
 * DELETE /api/shares/:shareId
 * Revoke a share link (only owner can revoke)
 */
export async function DELETE(
  req: Request,
  { params }: { params: { shareId: string } }
) {
  try {
    const { shareId } = params;
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const share = await prisma.share.findUnique({
      where: { id: shareId },
      select: { createdBy: true },
    });

    if (!share) {
      return NextResponse.json(
        { error: "Share not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    if (share.createdBy !== userId) {
      return NextResponse.json(
        { error: "Unauthorized - you don't own this share" },
        { status: 403, headers: withCORS(req) }
      );
    }

    // Revoke share
    await prisma.share.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });

    console.log(`[DELETE SHARE] Share ${shareId} revoked by user ${userId}`);

    return NextResponse.json(
      { message: "Share revoked successfully" },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[DELETE /api/shares/:shareId] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to revoke share" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
