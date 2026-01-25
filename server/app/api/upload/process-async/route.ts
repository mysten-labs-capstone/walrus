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
    // Reduced logging to minimize CPU usage (Render has 1 CPU limit)
    const body = await req.json();
    const { fileId, s3Key, tempBlobId, userId, epochs } = body;

    if (!fileId || !s3Key || !tempBlobId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Update status to processing
    try {
      await prisma.file.update({
        where: { id: fileId },
        data: { status: 'processing' },
      });
    } catch (dbErr: any) {
      // Only log critical errors
      // console.error(`[BACKGROUND JOB] Failed to update status to processing for ${fileId}:`, dbErr?.message || dbErr);
      return NextResponse.json({ error: 'DB update failed', detail: dbErr?.message || String(dbErr) }, { status: 500, headers: withCORS(req) });
    }

    // Download from S3
    let buffer: Buffer;
    try {
      buffer = await s3Service.download(s3Key);
    } catch (s3Err: any) {
      // Reduced logging
      // console.error(`[BACKGROUND JOB] Failed to download from S3 ${s3Key}:`, s3Err?.message || s3Err);
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
      const result = await walrusClient.writeBlob({
        blob: new Uint8Array(buffer),
        signer,
        epochs,
        deletable: true,
      });

      blobId = result.blobId;
      blobObjectId = result.blobObject?.id?.id || null;
    } catch (err: any) {
      // Reduced logging - only extract blobId if available
      const match = err?.message?.match(/blob ([A-Za-z0-9_-]+)/);
      if (match) {
        blobId = match[1];
      } else {
        const elapsed = Date.now() - startTime;
        uploadError = err?.message || String(err);
        // Only log if it's a real failure (no blobId extracted)
        // console.error(`[BACKGROUND JOB] Walrus upload failed after ${elapsed}ms for file ${fileId}:`, uploadError);
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
      // Reduced logging
      // console.log(`[BACKGROUND JOB] File will remain in S3 for 24 hours as backup: ${s3Key}`);

      return NextResponse.json(
        {
          message: "Background upload completed",
          blobId,
          status: "completed",
        },
        { status: 200, headers: withCORS(req) }
      );
    } else {
      // Reduced logging
      // const elapsed = Date.now() - startTime;
      // console.error(`[BACKGROUND JOB] Upload failed for file ${fileId} after ${elapsed}ms. Error: ${uploadError}`);
      
      try {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            status: 'failed',
          },
        });
      } catch (dbErr: any) {
        // Reduced logging
        // console.error(`[BACKGROUND JOB] Failed to mark file ${fileId} as failed:`, dbErr?.message || dbErr);
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
    // Reduced logging to minimize CPU usage
    // const elapsed = Date.now() - startTime;
    // console.error(`[BACKGROUND JOB] Unexpected error after ${elapsed}ms:`, err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}