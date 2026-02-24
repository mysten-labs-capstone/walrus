import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";
import { purgeFileIfExpiredById } from "../../_utils/expiredFiles";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * GET /api/files/:blobId
 * Returns file metadata
 */
export async function GET(
  req: Request,
  { params }: { params: { blobId: string } },
) {
  try {
    const { blobId } = params;
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) },
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
        uploadedAt: true,
        userId: true,
        epochs: true,
        status: true,
        expiresAt: true,
      },
    });

    if (!file) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404, headers: withCORS(req) },
      );
    }

    const wasPurged = await purgeFileIfExpiredById(file.id);
    if (wasPurged) {
      return NextResponse.json(
        { error: "File expired and was removed" },
        { status: 404, headers: withCORS(req) },
      );
    }

    // Auto-correct: If file has a real (non-temp) blobId but status is "failed" or "pending",
    // it means the upload actually succeeded but status wasn't updated. Correct it to "completed".
    let fileStatus = file.status;
    if (
      file.status &&
      (file.status === "failed" || file.status === "pending") &&
      !file.blobId.startsWith("temp_")
    ) {
      try {
        await prisma.file.update({
          where: { id: file.id },
          data: { status: "completed" },
        });
        fileStatus = "completed";
      } catch (updateErr: any) {
        console.warn(
          "[GET /api/files] Failed to auto-correct status for file with real blobId:",
          updateErr,
        );
        // Don't fail the request if correction fails
      }
    }

    const isOwner = userId && file.userId === userId;

    // Return metadata
    const response = {
      id: file.id,
      blobId: file.blobId,
      filename: file.filename,
      size: file.originalSize,
      contentType: file.contentType,
      encrypted: file.encrypted,
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
      { status: 500, headers: withCORS(req) },
    );
  }
}
