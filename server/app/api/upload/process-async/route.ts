import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { s3Service } from "@/utils/s3Service";
import { calculateExpirationDate } from "@/utils/epochService";
// TODO: cacheService removed from async processing to simplify flow and avoid cache errors
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";
export const maxDuration = 180; // 3 minutes (increased from 2 minutes to allow longer Walrus timeouts)

/**
 * Background job to upload files from S3 to Walrus
 * Called asynchronously after fast S3 upload completes
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { fileId, s3Key, tempBlobId, userId, epochs } = body;

    if (!fileId || !s3Key || !tempBlobId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Update status to processing
    try {
      await prisma.file.update({
        where: { id: fileId },
        data: { status: "processing" },
      });
    } catch (dbErr: any) {
      console.error("[process-async] DB update failed:", dbErr);
      return NextResponse.json(
        { error: "DB update failed", detail: dbErr?.message || String(dbErr) },
        { status: 500, headers: withCORS(req) },
      );
    }

    // Download from S3
    let buffer: Buffer;
    try {
      const s3StartTime = Date.now();
      buffer = await s3Service.download(s3Key);
      const s3Duration = Date.now() - s3StartTime;
    } catch (s3Err: any) {
      console.error("[process-async] S3 download failed:", s3Err);
      await prisma.file
        .update({ where: { id: fileId }, data: { status: "failed" } })
        .catch(() => {});
      return NextResponse.json(
        {
          error: "S3 download failed",
          detail: s3Err?.message || String(s3Err),
        },
        { status: 500, headers: withCORS(req) },
      );
    }

    // Upload to Walrus with retries
    const { walrusClient, signer } = await initWalrus();

    // Get file details for logging
    const fileRecord = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        filename: true,
        originalSize: true,
        encrypted: true,
        contentType: true,
      },
    });

    // Increased timeout to match sync route - blockchain operations can be slow under load
    // Base timeout increased from 60s to 90s to prevent premature failures
    const baseTimeout = 90000; // 90 seconds (was 60s - too aggressive for blockchain ops)
    const perEpochTimeout = epochs > 3 ? (epochs - 3) * 20000 : 0;
    const uploadTimeout = Math.min(baseTimeout + perEpochTimeout, 170000); // Max ~2.8 minutes (leaves buffer for route maxDuration of 180s)

    let blobId: string | null = null;
    let blobObjectId: string | null = null;
    let uploadError: string | null = null;

    const uploadStartTime = Date.now();

    try {

      // Wrap in Promise.race for timeout protection
      const uploadPromise = walrusClient.writeBlob({
        blob: new Uint8Array(buffer),
        signer,
        epochs,
        deletable: true,
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Walrus upload timeout after ${uploadTimeout}ms`)),
          uploadTimeout,
        ),
      );

      const result = await Promise.race([uploadPromise, timeoutPromise]);

      const uploadDuration = Date.now() - uploadStartTime;

      blobId = (result as any).blobId;
      blobObjectId = (result as any).blobObject?.id?.id || null;
    } catch (err: any) {
      const uploadDuration = Date.now() - uploadStartTime;
      console.error("[process-async] Walrus upload FAILED:", {
        fileId,
        filename: fileRecord?.filename,
        encrypted: fileRecord?.encrypted,
        duration: `${uploadDuration}ms`,
        error: err?.message || String(err),
        errorStack: err?.stack,
      });

      // Extract blobId from error message if available
      const match = err?.message?.match(/blob ([A-Za-z0-9_-]+)/);
      if (match) {
        blobId = match[1];
      } else {
        uploadError = err?.message || String(err);
      }
    }

    if (blobId) {
      // Update database with real blobId
      try {
        const expiresAt = await calculateExpirationDate(epochs);
        await prisma.file.update({
          where: { id: fileId },
          data: {
            blobId,
            blobObjectId,
            status: "completed",
            lastAccessedAt: new Date(),
            expiresAt,
          },
        });
      } catch (dbErr: any) {
        // Handle duplicate blobId (same file uploaded multiple times)
        if (dbErr.code === "P2002" && dbErr.meta?.target?.includes("blobId")) {
          // Delete this duplicate file record since Walrus already has the content
          await prisma.file.delete({
            where: { id: fileId },
          });

          return NextResponse.json(
            {
              message:
                "Duplicate file detected and removed (Walrus already has this content)",
              blobId,
              status: "duplicate_removed",
            },
            { status: 200, headers: withCORS(req) },
          );
        }

        // Re-throw other errors
        throw dbErr;
      }

      const totalDuration = Date.now() - startTime;
      return NextResponse.json(
        {
          message: "Background upload completed",
          blobId,
          status: "completed",
        },
        { status: 200, headers: withCORS(req) },
      );
    } else {
      console.error("[process-async] No blobId received, marking as failed:", {
        fileId,
        uploadError,
      });
      try {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            status: "failed",
          },
        });
      } catch (dbErr: any) {
        console.error(
          "[process-async] Failed to update status to failed:",
          dbErr,
        );
        // Silently handle DB errors
      }

      return NextResponse.json(
        {
          message: `Background upload failed, will retry via cron`,
          error: uploadError,
          status: "failed",
          s3Key,
          fileId,
        },
        { status: 500, headers: withCORS(req) },
      );
    }
  } catch (err: any) {
    console.error("[process-async] UNEXPECTED ERROR:", {
      error: err?.message || String(err),
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
