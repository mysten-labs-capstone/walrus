import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/files/:blobId
 * Returns file metadata including wrappedFileKey (for owner only)
 * This enables client-side decryption with per-file keys
 */
export async function GET(
  req: Request,
  { params }: { params: { blobId: string } }
) {
  try {
    const { blobId } = params;
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const file = await prisma.file.findUnique({
      where: { blobId },
      select: {
        id: true,
        blobId: true,
        filename: true,
        originalSize: true,
        contentType: true,
        encrypted: true,
        wrappedFileKey: true,
        uploadedAt: true,
        userId: true,
        epochs: true,
        status: true,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // In development, mark pending files as completed so they can be shared
    let fileStatus = file.status;
    if (process.env.NODE_ENV !== "production" && file.status === "pending") {
      console.log(`[GET /api/files/:blobId] Auto-marking file ${file.id} as completed (was pending)`);
      await prisma.file.update({
        where: { id: file.id },
        data: { status: "completed" },
      });
      fileStatus = "completed";
    }

    const isOwner = userId && file.userId === userId;

    // Return metadata
    // wrappedFileKey is only included for the owner
    const response = {
      id: file.id,
      blobId: file.blobId,
      filename: file.filename,
      size: file.originalSize,
      contentType: file.contentType,
      encrypted: file.encrypted,
      wrappedFileKey: isOwner ? file.wrappedFileKey : undefined, // SECURITY: only for owner
      uploadedAt: file.uploadedAt,
      epochs: file.epochs,
      status: fileStatus,
      isOwner,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: withCORS(req),
    });
  } catch (err: any) {
    console.error("[GET /api/files/:blobId] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch file metadata" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
