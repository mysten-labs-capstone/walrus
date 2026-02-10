import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { s3Service } from "@/utils/s3Service";
// TODO: cacheService removed from async processing to simplify flow and avoid cache errors
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";
import { calculateUploadCostUSD, deductPayment } from "@/utils/paymentService";

export const runtime = "nodejs";
export const maxDuration = 180; // 3 minutes (increased from 2 minutes to allow longer Walrus timeouts)

/**
 * Detects if error is due to stale coin state (object version mismatch)
 * This happens when a transaction fails partway through and the coin's version increments,
 * but the retry still tries to use the old version
 */
function isCoinStateError(error: any): boolean {
  const message = error?.message || String(error);
  return (
    message.includes("is not available for consumption") ||
    message.includes("current version")
  );
}

/**
 * Upload blob to Walrus with coin state retry logic
 * When a transaction fails mid-execution, coin state becomes stale.
 * This wrapper fetches fresh coins from the blockchain and retries.
 */
async function writeWithCoinRetry(
  walrusClient: any,
  suiClient: any,
  signer: any,
  blobData: Uint8Array,
  epochs: number,
  maxRetries: number = 3,
  uploadTimeout: number = 170000,
): Promise<{ blobId: string; blobObjectId: string | null }> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // On retry after coin state error, fetch fresh coins to update our view of chain state
      if (attempt > 0) {
        try {
          const signerAddress = signer.toSuiAddress();
          const freshCoins = await suiClient.getCoins({ owner: signerAddress });
        } catch (coinErr: any) {
          console.warn(
            `[process-async] Failed to fetch fresh coins: ${coinErr?.message}`,
          );
          // Continue anyway - writeBlob will try with whatever state it has
        }
      }

      // Attempt upload with timeout protection
      const uploadPromise = walrusClient.writeBlob({
        blob: blobData,
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

      return {
        blobId: (result as any).blobId,
        blobObjectId: (result as any).blobObject?.id?.id || null,
      };
    } catch (err: any) {
      lastError = err;
      const isCoinError = isCoinStateError(err);
      const isRetryable =
        isCoinError ||
        err?.message?.includes("temporarily unavailable") ||
        err?.message?.includes("timeout");

      console.error(
        `[process-async] Upload attempt ${attempt + 1}/${maxRetries + 1} failed:`,
        {
          error: err?.message,
          isCoinStateError: isCoinError,
          isRetryable,
        },
      );

      // Only retry on specific retryable errors
      if (attempt < maxRetries && isRetryable) {
        // Exponential backoff: 2s, 4s, 8s
        const delayMs = 2000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      // Non-retryable error or max retries exceeded
      throw err;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error("Upload failed after all retries");
}

/**
 * Background job to upload files from S3 to Walrus
 * Called asynchronously after fast S3 upload completes
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { fileId, s3Key, tempBlobId, userId, epochs } = body;

    if (!fileId || !s3Key || !tempBlobId || !userId) {
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
    const { walrusClient, signer, suiClient } = await initWalrus();

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
      const result = await writeWithCoinRetry(
        walrusClient,
        suiClient,
        signer,
        new Uint8Array(buffer),
        epochs,
        3, // maxRetries
        uploadTimeout,
      );
      blobId = result.blobId;
      blobObjectId = result.blobObjectId;
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
      // Get the filename from the current file record for deduplication
      const currentFile = await prisma.file.findUnique({
        where: { id: fileId },
        select: { filename: true },
      });

      // Update database with real blobId
      try {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            blobId,
            blobObjectId,
            status: "completed",
            lastAccessedAt: new Date(),
          },
        });

        // Clean up old failed/pending records with the same userId and filename
        // This prevents duplicate file entries when uploads are retried
        if (currentFile?.filename) {
          try {
            await prisma.file.deleteMany({
              where: {
                userId,
                filename: currentFile.filename,
                id: { not: fileId }, // Don't delete the current file
                status: { in: ["failed", "pending"] }, // Only delete failed or pending ones
              },
            });
          } catch (cleanupErr: any) {
            console.warn(
              "[process-async] Failed to cleanup old failed records:",
              cleanupErr,
            );
            // Don't fail the upload if cleanup fails
          }
        }
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

      let paymentError: string | null = null;
      try {
        const costUSD = await calculateUploadCostUSD(buffer.length, epochs);
        await deductPayment(
          userId,
          costUSD,
          `Upload: ${fileRecord?.filename || "file"}`,
        );
      } catch (paymentErr: any) {
        paymentError = paymentErr?.message || String(paymentErr);
        console.error("[process-async] Payment failed after upload:", {
          fileId,
          error: paymentError,
        });
      }

      const totalDuration = Date.now() - startTime;
      return NextResponse.json(
        {
          message: "Background upload completed",
          blobId,
          status: "completed",
          paymentError: paymentError || undefined,
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
