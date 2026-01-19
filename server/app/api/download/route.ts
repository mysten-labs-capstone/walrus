import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";
import { encryptionService } from "@/utils/encryptionService";
import { s3Service } from "@/utils/s3Service";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

// Helper function to download with retries
async function downloadWithRetry(
  walrusClient: any,
  blobId: string,
  maxRetries: number = 8,
  initialDelayMs: number = 2000
): Promise<Uint8Array> {
  let lastError: any;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Download attempt ${attempt}/${maxRetries} for ${blobId}`);
      const bytes = await walrusClient.readBlob({ blobId });
      
      if (bytes && bytes.length > 0) {
        console.log(`Download successful on attempt ${attempt}, size: ${bytes.length} bytes`);
        return bytes;
      }
    } catch (err: any) {
      lastError = err;
      const isSliverError = err.message?.includes("slivers") || err.message?.includes("not enough");
      
      console.warn(`Attempt ${attempt}/${maxRetries} failed: ${err.message}${isSliverError ? ' (replication in progress)' : ''}`);
      
      if (attempt < maxRetries) {
        const waitTime = isSliverError 
          ? Math.min(delayMs * 1.8, 8000)
          : Math.min(delayMs * 1.3, 4000);
        
        console.log(`Waiting ${Math.round(waitTime)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        delayMs = waitTime;
      } else {
        if (isSliverError) {
          throw new Error(`File is still being replicated across storage nodes. This typically takes 30-90 seconds after upload. Please wait and try again in a moment.`);
        }
        throw err;
      }
    }
  }

  throw lastError || new Error("Download failed after all retries");
}

export async function POST(req: Request) {
  const timeoutMs = 45000;
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Download timeout - file may be too large or network is slow. Please try again or use a smaller file.')), timeoutMs)
  );

  try {
    return await Promise.race([
      handleDownload(req),
      timeoutPromise
    ]) as Response;
  } catch (err: any) {
    console.error("Download error:", err);
    
    let errorMessage = err.message;
    if (err.message?.includes("slivers")) {
      errorMessage = "File is still being replicated across storage nodes. Please wait 30-60 seconds and try again.";
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: withCORS(req) }
    );
  }
}

async function handleDownload(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { blobId, filename, userId, userPrivateKey, decryptOnServer, shareId } = body ?? {};

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if file exists and get ownership info
    let fileRecord = null;
    let isOwner = false;
    
    try {
      // TODO: removed cacheService usage to simplify download path and avoid cache-related errors
      fileRecord = await prisma.file.findUnique({
        where: { blobId },
        select: {
          userId: true,
          encrypted: true,
          userKeyEncrypted: true,
          masterKeyEncrypted: true,
          filename: true,
          uploadedAt: true,
          status: true,
          s3Key: true,
        }
      });

      if (fileRecord && userId) {
        isOwner = fileRecord.userId === userId;
      }
    } catch (err) {
      console.warn(`Could not check file ownership:`, err);
    }

    // If file is marked as processing/pending and there's no S3 copy yet,
    // bail out early so we don't block on long Walrus reads and cause platform timeouts/CORS issues.
    // TODO: adjust this logic if you want to allow long-polling for availability.
    if (fileRecord && (fileRecord.status === 'processing' || fileRecord.status === 'pending') && !fileRecord.s3Key) {
      console.log(`File ${blobId} is ${fileRecord.status} and has no S3 copy yet - returning 202`);
      return NextResponse.json(
        {
          status: 'processing',
          message: 'File upload is still processing. Please retry in 30-60 seconds.',
          uploadedAt: fileRecord.uploadedAt,
        },
        { status: 202, headers: withCORS(req) }
      );
    }

    // If file is encrypted and user is not the owner, require userPrivateKey
    // UNLESS it's a share link download (shareId provided) - in that case, allow download
    // because decryption happens client-side with the key from the URL fragment
    if (fileRecord?.encrypted && !isOwner && !userPrivateKey && !shareId) {
      return NextResponse.json(
        { 
          error: "This file is encrypted. Please provide the encryption key to download.",
          requiresKey: true,
          isOwner: false
        },
        { status: 403, headers: withCORS(req) }
      );
    }

    // If user is owner but didn't provide their key, try to fetch it
    let effectivePrivateKey = userPrivateKey;
    if (isOwner && !effectivePrivateKey && userId && fileRecord?.encrypted) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { privateKey: true }
        });
        effectivePrivateKey = user?.privateKey || null;
        if (effectivePrivateKey) {
          console.log(`Using owner's stored encryption key`);
        }
      } catch (err) {
        console.warn(`Could not fetch user's encryption key:`, err);
      }
    }
    
    console.log(`Download request: blobId=${blobId}, isOwner=${isOwner}, hasKey=${!!effectivePrivateKey}`);

    const downloadName = filename?.trim() || fileRecord?.filename || `${blobId}`;
    let bytes: Uint8Array | undefined;
    let fromCache = false;
    let fromS3 = false;

    // PRIORITY 1: Try S3 FIRST (with retries and backoff). If the file is still
    // processing (Walrus upload not completed), prefer repeated S3 retries and
    // only fall back to Walrus once the DB `status` is `completed`.
    if (fileRecord?.s3Key && s3Service.isEnabled()) {
      const maxAttempts = Number(process.env.S3_DOWNLOAD_RETRIES || 6);
      const perAttemptTimeout = Number(process.env.S3_DOWNLOAD_TIMEOUT_MS || 10000);
      let attempt = 0;
      let lastS3Error: any = null;

      while (attempt < maxAttempts && !bytes) {
        attempt++;
        try {
          console.log(`S3 download attempt ${attempt}/${maxAttempts} for ${fileRecord.s3Key}`);
          const s3DownloadPromise = s3Service.download(fileRecord.s3Key);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('S3 download timeout')), perAttemptTimeout)
          );
          const s3Buffer = await Promise.race([s3DownloadPromise, timeoutPromise]);
          bytes = new Uint8Array(s3Buffer as Buffer);
          fromS3 = true;
          console.log(`✅ S3 download successful on attempt ${attempt}: ${bytes.length} bytes`);
          break;
        } catch (s3Err: any) {
          lastS3Error = s3Err;
          console.warn(`S3 download attempt ${attempt} failed: ${s3Err?.message || s3Err}`);

          // Re-check DB status; if the background process finished, prefer Walrus
          try {
            const refreshed = await prisma.file.findUnique({ where: { blobId }, select: { status: true, s3Key: true } });
            if (refreshed) {
              fileRecord.status = refreshed.status as any;
              fileRecord.s3Key = refreshed.s3Key;
              if (fileRecord.status === 'completed') {
                console.log('File status is now completed; will attempt Walrus fallback');
                break;
              }
            }
          } catch (dbErr) {
            console.warn('Failed to re-check file status during S3 retries:', dbErr);
          }

          // Backoff before next attempt
          const waitMs = Math.min(1000 * Math.pow(1.6, attempt), 5000);
          await new Promise(res => setTimeout(res, waitMs));
        }
      }

      if (!bytes && fileRecord && (fileRecord.status === 'processing' || fileRecord.status === 'pending')) {
        console.log(`File ${blobId} is ${fileRecord.status} and S3 downloads failed; returning 202`);
        return NextResponse.json(
          {
            status: 'processing',
            message: 'File upload is still processing. Please retry in 30-60 seconds.',
            uploadedAt: fileRecord.uploadedAt,
            s3Error: lastS3Error?.message || String(lastS3Error || ''),
          },
          { status: 202, headers: withCORS(req) }
        );
      }

      if (!bytes && lastS3Error) {
        console.warn('All S3 attempts failed; will try Walrus fallback');
      }
    }

    // PRIORITY 2: Skip local cache (removed). Fall through to Walrus if S3 failed.

    // PRIORITY 3: Try Walrus (if S3 and cache both failed)
    if (!bytes) {
      try {
        const { walrusClient } = await initWalrus();
        console.log(`Fetching blob ${blobId} from Walrus...`);
        bytes = await downloadWithRetry(walrusClient, blobId, 8, 2000);
        
        // Skipping caching to avoid cache-related errors (cache removed)
      } catch (walrusErr: any) {
        console.error(`Walrus download failed for ${blobId}:`, walrusErr?.message);
        
        // Last resort: try S3 again if we haven't already
        if (!fromS3 && fileRecord?.s3Key && s3Service.isEnabled()) {
          try {
            console.log(`Walrus failed, trying S3 as last resort: ${fileRecord.s3Key}`);
            const s3Buffer = await s3Service.download(fileRecord.s3Key);
            bytes = new Uint8Array(s3Buffer);
            fromS3 = true;
            console.log(`S3 fallback successful: ${bytes.length} bytes`);
          } catch (s3FallbackErr) {
            console.error(`S3 fallback also failed:`, s3FallbackErr);
          }
        }
        
        if (!bytes) {
          // If file was recently uploaded, provide helpful message
          if (fileRecord) {
            const uploadedAt = new Date(fileRecord.uploadedAt || 0);
            const ageSeconds = (Date.now() - uploadedAt.getTime()) / 1000;
            
            if (ageSeconds < 120 || walrusErr?.message?.includes("metadata") || walrusErr?.message?.includes("slivers")) {
              throw new Error(`File is still being replicated to storage nodes (uploaded ${Math.floor(ageSeconds)}s ago). Please wait 30-60 seconds and try again.`);
            }
          }
          
          if (walrusErr?.message?.includes("metadata")) {
            throw new Error("Unable to retrieve file from storage network. The file may not exist or is still being uploaded.");
          }
          
          throw walrusErr;
        }
      }
    }

    if (!bytes || bytes.length === 0) {
      return NextResponse.json(
        { error: "Blob had no data" },
        { status: 404, headers: withCORS(req) }
      );
    }

    let finalBytes = bytes;
    let decrypted = false;

    // Handle server-side decryption if requested
    if (decryptOnServer && effectivePrivateKey) {
      try {
        console.log(`Decrypting on server...`);
        const buffer = Buffer.from(bytes);
        
        const { metadata, dataStart } = encryptionService.parseMetadataHeader(buffer);
        const encryptedData = buffer.subarray(dataStart);
        
        const decryptedBuffer = await encryptionService.doubleDecrypt(
          encryptedData,
          effectivePrivateKey,
          Buffer.from(metadata.userSalt, 'base64'),
          Buffer.from(metadata.userIv, 'base64'),
          Buffer.from(metadata.userAuthTag, 'base64'),
          Buffer.from(metadata.masterIv, 'base64'),
          Buffer.from(metadata.masterAuthTag, 'base64')
        );
        
        finalBytes = new Uint8Array(decryptedBuffer);
        decrypted = true;
        console.log(`Decrypted: ${finalBytes.length} bytes`);
      } catch (decryptErr) {
        console.error(`Decryption failed:`, decryptErr);
        return NextResponse.json(
          { error: "Decryption failed. Wrong key or corrupted data." },
          { status: 400, headers: withCORS(req) }
        );
      }
    }

    // At this point, bytes should contain the file data
    if (bytes) {
      // Log first 16 bytes for debugging
      const headerBytes = Array.from(bytes.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[Download] First 16 bytes of blob ${blobId}:`, headerBytes);
    }

    console.log(
      `💬 Download ready: ${downloadName} (${finalBytes.length} bytes, BlobId: ${blobId}, Cached: ${fromCache}, S3: ${fromS3}, Decrypted: ${decrypted})`
    );

    const headers = withCORS(req, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(finalBytes.length),
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "no-store",
      "X-From-Cache": fromCache ? "true" : "false",
      "X-From-S3": fromS3 ? "true" : "false",
      "X-Decrypted": decrypted ? "true" : "false",
    });

    return new Response(Buffer.from(finalBytes), { status: 200, headers });
  } catch (err: any) {
    throw err;
  }
}