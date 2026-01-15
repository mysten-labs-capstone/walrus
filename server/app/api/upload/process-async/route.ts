import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { s3Service } from "@/utils/s3Service";
import { cacheService } from "@/utils/cacheService";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";
export const maxDuration = 120; // Max for proxied requests on Vercel Pro

/**
 * Background job to upload files from S3 to Walrus
 * Called asynchronously after fast S3 upload completes
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { fileId, s3Key, tempBlobId, userId, epochs } = body;

    console.log(`[BACKGROUND JOB] Received request for file ${fileId}, s3Key: ${s3Key}`);

    if (!fileId || !s3Key || !tempBlobId) {
      console.error(`[BACKGROUND JOB] Missing parameters: fileId=${fileId}, s3Key=${s3Key}, tempBlobId=${tempBlobId}`);
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400, headers: withCORS(req) }
      );
    }

    console.log(`[BACKGROUND JOB] Processing async upload for file ${fileId}, s3Key: ${s3Key}`);

    // Update status to processing
    console.log(`[BACKGROUND JOB] Updating file ${fileId} status to 'processing'`);
    await prisma.file.update({
      where: { id: fileId },
      data: { status: 'processing' },
    });
    console.log(`[BACKGROUND JOB] Status updated successfully`);

    // Download from S3
    const buffer = await s3Service.download(s3Key);
    console.log(`[BACKGROUND JOB] Downloaded ${buffer.length} bytes from S3`);

    // Upload to Walrus with retries
    const { walrusClient, signer } = await initWalrus();
    
    // Scale timeout based on epochs (max 110s to fit within 120s Vercel limit)
    const baseTimeout = 60000; // 60s base
    const perEpochTimeout = epochs > 3 ? (epochs - 3) * 10000 : 0; // 10s per epoch
    const uploadTimeout = Math.min(baseTimeout + perEpochTimeout, 110000); // Max 110s (留10s for overhead)

    let blobId: string | null = null;
    let blobObjectId: string | null = null;
    let uploadError: string | null = null;

    // Single attempt per invocation - cron will retry on failure
    try {
      console.log(`[BACKGROUND JOB] Uploading to Walrus with ${uploadTimeout}ms timeout...`);

      const result = await walrusClient.writeBlob({
        blob: new Uint8Array(buffer),
        signer,
        epochs,
        deletable: true,
      });

      blobId = result.blobId;
      blobObjectId = result.blobObject?.id?.id || null;
      
      console.log(`[BACKGROUND JOB] Walrus upload successful: ${blobId}`);
    } catch (err: any) {
      // Try to extract blobId from error message
      const match = err?.message?.match(/blob ([A-Za-z0-9_-]+)/);
      if (match) {
        blobId = match[1];
        console.log(`[BACKGROUND JOB] Extracted blobId from error: ${blobId}`);
      } else {
        const elapsed = Date.now() - startTime;
        uploadError = err?.message || String(err);
        console.error(`[BACKGROUND JOB] Walrus upload failed after ${elapsed}ms for file ${fileId}:`, uploadError);
      }
    }

    if (blobId) {
      // Update database with real blobId
      await prisma.file.update({
        where: { id: fileId },
        data: {
          blobId,
          blobObjectId,
          status: 'completed',
          lastAccessedAt: new Date(), // Use this to track when Walrus upload completed
        },
      });

      // Cache the blob
      try {
        await cacheService.init();
        const fileRecord = await prisma.file.findUnique({ where: { id: fileId } });
        if (fileRecord) {
          await cacheService.set(blobId, userId, buffer, {
            filename: fileRecord.filename,
            originalSize: fileRecord.originalSize,
            contentType: fileRecord.contentType,
            encrypted: fileRecord.encrypted,
            userKeyEncrypted: fileRecord.userKeyEncrypted,
            masterKeyEncrypted: fileRecord.masterKeyEncrypted,
            blobObjectId,
            epochs,
          });
          console.log(`[BACKGROUND JOB] Cached blob ${blobId}`);
        }
      } catch (cacheErr) {
        console.warn(`[BACKGROUND JOB] Caching failed (non-fatal):`, cacheErr);
      }

      // Keep file in S3 for 24 hours as backup, then clean up via scheduled job
      // See /api/cleanup/s3-old-files for automated cleanup
      console.log(`[BACKGROUND JOB] File will remain in S3 for 24 hours as backup: ${s3Key}`);

      return NextResponse.json(
        {
          message: "Background upload completed",
          blobId,
          status: "completed",
        },
        { status: 200, headers: withCORS(req) }
      );
    } else {
      // Upload failed, mark as failed but keep S3 copy for cron retry
      const elapsed = Date.now() - startTime;
      console.error(`[BACKGROUND JOB] Upload failed for file ${fileId} after ${elapsed}ms. Error: ${uploadError}`);
      console.log(`[BACKGROUND JOB] File will remain in S3 for cron retry: ${s3Key}`);
      
      await prisma.file.update({
        where: { id: fileId },
        data: {
          status: 'failed',
          // S3 key remains so cron can retry later
        },
      });

      return NextResponse.json(
        {
          message: `Background upload failed, will retry via cron`,
          error: uploadError,
          status: "failed",
          s3Key,
          fileId,
        },
        { status: 500, headers: withCORS(req) }
      );
    }
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[BACKGROUND JOB] Unexpected error after ${elapsed}ms:`, err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
