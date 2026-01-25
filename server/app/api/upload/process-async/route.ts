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
      return NextResponse.json({ error: 'DB update failed', detail: dbErr?.message || String(dbErr) }, { status: 500, headers: withCORS(req) });
    }

    // Download from S3
    let buffer: Buffer;
    try {
      buffer = await s3Service.download(s3Key);
    } catch (s3Err: any) {
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

      return NextResponse.json(
        {
          message: "Background upload completed",
          blobId,
          status: "completed",
        },
        { status: 200, headers: withCORS(req) }
      );
    } else {
      try {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            status: 'failed',
          },
        });
      } catch (dbErr: any) {
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
        { status: 500, headers: withCORS(req) }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}