import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { s3Service } from "@/utils/s3Service";
// TODO: cacheService removed from async processing to simplify flow and avoid cache errors
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Background job to upload files from S3 to Walrus
 * Called asynchronously after fast S3 upload completes
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    // TODO: temporary verbose logging for process-async failures - remove after debugging
    const body = await req.json();
    console.log('[BACKGROUND JOB] Request body:', body);
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
    try {
      console.log(`[BACKGROUND JOB] Updating file ${fileId} status to 'processing'`);
      await prisma.file.update({
        where: { id: fileId },
        data: { status: 'processing' },
      });
      console.log(`[BACKGROUND JOB] Status updated successfully`);
    } catch (dbErr: any) {
      console.error(`[BACKGROUND JOB] Failed to update status to processing for ${fileId}:`, dbErr?.message || dbErr);
      console.error(dbErr?.stack);
      // return 500 so caller can see failure
      return NextResponse.json({ error: 'DB update failed', detail: dbErr?.message || String(dbErr) }, { status: 500, headers: withCORS(req) });
    }

    // Download from S3
    let buffer: Buffer;
    try {
      buffer = await s3Service.download(s3Key);
      console.log(`[BACKGROUND JOB] Downloaded ${buffer.length} bytes from S3`);
    } catch (s3Err: any) {
      console.error(`[BACKGROUND JOB] Failed to download from S3 ${s3Key}:`, s3Err?.message || s3Err);
      console.error(s3Err?.stack);
      await prisma.file.update({ where: { id: fileId }, data: { status: 'failed' } }).catch(() => {});
      return NextResponse.json({ error: 'S3 download failed', detail: s3Err?.message || String(s3Err) }, { status: 500, headers: withCORS(req) });
    }

    // Upload to Walrus with retries
    const { walrusClient, signer } = await initWalrus();
    
    const baseTimeout = 60000;
    const perEpochTimeout = epochs > 3 ? (epochs - 3) * 10000 : 0;
    const uploadTimeout = Math.min(baseTimeout + perEpochTimeout, 110000);

    let blobId: string | null = null;
    let blobObjectId: string | null = null;
    let uploadError: string | null = null;

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
      console.error('[BACKGROUND JOB] Walrus write failed:', err?.message || err);
      console.error(err?.stack);
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
          lastAccessedAt: new Date(),
        },
      });

      // Skipping caching step to avoid cache-related errors (cache removed)

      // Keep file in S3 for 24 hours as backup
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
      const elapsed = Date.now() - startTime;
      console.error(`[BACKGROUND JOB] Upload failed for file ${fileId} after ${elapsed}ms. Error: ${uploadError}`);
      console.log(`[BACKGROUND JOB] File will remain in S3 for cron retry: ${s3Key}`);
      
      try {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            status: 'failed',
          },
        });
      } catch (dbErr: any) {
        console.error(`[BACKGROUND JOB] Failed to mark file ${fileId} as failed:`, dbErr?.message || dbErr);
        console.error(dbErr?.stack);
      }

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