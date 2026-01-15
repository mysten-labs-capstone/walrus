import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import { encryptionService } from "@/utils/encryptionService";
import { s3Service } from "@/utils/s3Service";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";
export const maxDuration = 300; 

// Track background job triggers to stagger them
let backgroundJobCounter = 0;

// Optional helper to measure time
async function timeIt<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now?.() ?? Date.now();
  const result = await fn();
  const t1 = performance.now?.() ?? Date.now();
  const ms = t1 - t0;
  console.log(`[timing] ${label}: ${ms.toFixed(1)} ms`);
  return { result, ms };
}

// Send log to /api/metrics if route exists (non-fatal if not)
async function logMetric(data: Record<string, any>) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_API_BASE ?? ""}/api/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    /* ignore if metrics endpoint unavailable */
  }
}

// Helper to verify blob exists in Walrus by attempting to read it
async function verifyBlobExists(walrusClient: any, blobId: string): Promise<boolean> {
  try {
    const bytes = await walrusClient.readBlob({ blobId });
    if (bytes && bytes.length > 0) {
      console.log(`Blob ${blobId} verified - ${bytes.length} bytes readable`);
      return true;
    }
    console.warn(`Blob ${blobId} verification failed - empty response`);
    return false;
  } catch (err: any) {
    console.warn(`Blob ${blobId} verification failed:`, err?.message);
    return false;
  }
}

// Helper function to upload with retries and smart timeout management
async function uploadWithTimeout(
  walrusClient: any,
  blob: Uint8Array,
  signer: any,
  timeoutMs: number = 90000,
  maxRetries: number = 2,
  epochs: number = 3
) {
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let blobIdFromError: string | null = null;

    const uploadPromise = walrusClient
      .writeBlob({
        blob,
        signer,
        epochs,
        deletable: true,
      })
      .catch((err: any) => {
        const match = err?.message?.match(/blob ([A-Za-z0-9_-]+)/);
        if (match) {
          blobIdFromError = match[1];
        }
        throw err;
      });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Upload timeout")), timeoutMs)
    );

    try {
      const result = await Promise.race([uploadPromise, timeoutPromise]);
      const blobId = (result as any).blobId;
      const blobObjectId = (result as any).blobObjectId || (result as any).objectId || null;
      
      if (blobObjectId) {
        console.log(`Upload result: blobId=${blobId}, blobObjectId=${blobObjectId}`);
      }
      
      // Skip verification for faster response - Walrus writeBlob success means it's stored
      console.log(`Upload successful on attempt ${attempt}: ${blobId}`);
      return { success: true, blobId, blobObjectId };
    } catch (err: any) {
      lastError = err;
      
      // If we got a blobId from error, trust it (common with Walrus timeouts)
      if (blobIdFromError) {
        console.log(`Got blobId from error (attempt ${attempt}): ${blobIdFromError}, accepting as success`);
        return { success: true, blobId: blobIdFromError, fromError: true, blobObjectId: null };
      }
      
      // Retry if we have attempts left
      if (attempt < maxRetries) {
        const backoffMs = 1000 * attempt; // Shorter backoff: 1s, 2s
        console.log(`Retrying upload (attempt ${attempt + 1}/${maxRetries}) after ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
    }
  }

  throw lastError || new Error('Upload failed after all retries');
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const lazyFlag = formData.get("lazy") || "false"; // optional flag
    const userId = formData.get("userId") as string | null;
    const userPrivateKey = formData.get("userPrivateKey") as string | null;
    const encryptOnServer = formData.get("encryptOnServer") === "true";
    const enableCache = formData.get("enableCache") !== "false"; // default true
    const paymentAmount = formData.get("paymentAmount") as string | null; // USD cost
    const clientSideEncrypted = formData.get("clientSideEncrypted") === "true";
    const epochsParam = formData.get("epochs") as string | null; // User-selected storage duration
    const uploadMode = formData.get("uploadMode") as string | null; // "sync" (default) or "async"
    
    // Parse epochs: default to 3 (90 days) if not provided, validate it's a positive integer
    const epochs = epochsParam && parseInt(epochsParam, 10) > 0 ? Math.floor(parseInt(epochsParam, 10)) : 3;

    if (!file) {
      return NextResponse.json(
        { error: "Missing file" },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Payment amount is optional - will calculate from file size if not provided
    let costUSD = paymentAmount ? parseFloat(paymentAmount) : 0;

    console.log(`Uploading: ${file.name} (${file.size} bytes) for user ${userId}, epochs: ${epochs} (${epochs * 30} days), paymentAmount: ${paymentAmount}, costUSD: ${costUSD}`);
    let buffer = Buffer.from(await file.arrayBuffer());
    const originalSize = buffer.length;
    let userKeyEncrypted = clientSideEncrypted; // If encrypted on client, user key was used
    let masterKeyEncrypted = false;
    let encryptionMetadata: any = null;

    // Handle server-side encryption if requested
    if (encryptOnServer && userPrivateKey) {
      console.log(`Encrypting on server with dual keys...`);
      const result = await encryptionService.doubleEncrypt(buffer, userPrivateKey);
      
      // Create metadata header
      const header = encryptionService.createMetadataHeader({
        userSalt: result.userSalt,
        userIv: result.userIv,
        userAuthTag: result.userAuthTag,
        masterIv: result.masterIv,
        masterAuthTag: result.masterAuthTag,
        originalFilename: file.name,
      });
      
      buffer = Buffer.concat([header, result.encrypted]);
      userKeyEncrypted = true;
      masterKeyEncrypted = true;
      
      encryptionMetadata = {
        userSalt: result.userSalt.toString('base64'),
        userIv: result.userIv.toString('base64'),
        userAuthTag: result.userAuthTag.toString('base64'),
        masterIv: result.masterIv.toString('base64'),
        masterAuthTag: result.masterAuthTag.toString('base64'),
      };
      
      console.log(`Encrypted: ${buffer.length} bytes`);
    }

    // ASYNC MODE: Always use S3 first for instant uploads, then Walrus in background
    if (s3Service.isEnabled()) {
      console.log("[ASYNC MODE] Uploading to S3 for fast response...");
      console.log(`[ASYNC MODE] Payment info - paymentAmount from client: ${paymentAmount}, parsed costUSD: ${costUSD}`);
      
      // Calculate cost if not provided
      if (costUSD === 0) {
        console.log('[ASYNC MODE] No payment amount provided, calculating from file size...');
        const sizeInGB = file.size / (1024 * 1024 * 1024);
        const costSUI = Math.max(sizeInGB * 0.001 * epochs, 0.0000001); // min 0.0000001 SUI
        // Fetch SUI price (you may want to cache this)
        const { getSuiPriceUSD } = await import("@/utils/priceConverter");
        const suiPrice = await getSuiPriceUSD();
        costUSD = Math.max(costSUI * suiPrice, 0.01); // min $0.01
        console.log(`[ASYNC MODE] Calculated cost: ${costUSD} USD (${costSUI} SUI @ ${suiPrice} USD/SUI)`);
      }
      
      console.log(`[ASYNC MODE] Final cost to deduct: $${costUSD.toFixed(4)}`);
      
      // Deduct payment BEFORE upload (optimistic - we'll refund if upload fails)
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          throw new Error('User not found');
        }
        
        if (user.balance < costUSD) {
          throw new Error('Insufficient balance');
        }

        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: costUSD } },
        });
        console.log(`[ASYNC MODE] Deducted $${costUSD.toFixed(4)} from user ${userId} balance`);
      } catch (paymentErr: any) {
        console.error('[ASYNC MODE] Payment deduction failed:', paymentErr);
        return NextResponse.json(
          { error: `Payment failed: ${paymentErr.message}` },
          { status: 400, headers: withCORS(req) }
        );
      }
      
      // Generate temp blob ID
      const tempBlobId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const s3Key = s3Service.generateKey(userId, tempBlobId, file.name);
      
      // Upload to S3 (fast!)
      await s3Service.upload(s3Key, buffer, {
        contentType: file.type || 'application/octet-stream',
        userId,
        filename: file.name,
        encrypted: String(userKeyEncrypted || masterKeyEncrypted),
        epochs: String(epochs),
      });
      
      console.log(`[ASYNC MODE] Uploaded to S3: ${s3Key}`);
      
      // Save metadata with pending status
      await cacheService.init();
      const encryptedUserId = await cacheService['encryptUserId'](userId);
      
      const fileRecord = await prisma.file.create({
        data: {
          blobId: tempBlobId,
          blobObjectId: null,
          userId,
          encryptedUserId,
          filename: file.name,
          originalSize,
          contentType: file.type || 'application/octet-stream',
          encrypted: userKeyEncrypted || masterKeyEncrypted,
          userKeyEncrypted,
          masterKeyEncrypted,
          epochs,
          cached: false, // Will cache after Walrus upload
          uploadedAt: new Date(),
          lastAccessedAt: new Date(),
          s3Key: s3Key,
          status: 'pending', // Will be picked up by cron job every minute
        }
      });
      
      console.log(`[ASYNC MODE] File ${fileRecord.id} (${file.name}) saved with status=pending. Cron job will process it within 1 minute.`);
      
      // Return immediately - cron job will handle Walrus upload
      return NextResponse.json(
        {
          message: "SUCCESS: File uploaded to S3, Walrus upload will start within 1 minute!",
          blobId: tempBlobId,
          fileId: fileRecord.id,
          status: "pending",
          uploadMode: "async",
          s3Key,
          encrypted: userKeyEncrypted || masterKeyEncrypted,
          encryptionMetadata,
        },
        { status: 200, headers: withCORS(req) }
      );
    }

    // FALLBACK: If S3 is not enabled, return error (S3 is required for async uploads)
    console.error('[UPLOAD] S3 is not enabled! Cannot process upload.');
    return NextResponse.json(
      { error: "Upload service unavailable - S3 not configured" },
      { status: 503, headers: withCORS(req) }
    );

    // SYNC MODE: Original behavior - wait for Walrus upload

    /* SYNC MODE - DISABLED (kept for reference)
    // Original behavior - wait for Walrus upload directly
    console.log(`[SYNC MODE] Uploading directly to Walrus...`);
    const { walrusClient, signer } = await initWalrus();

    // Scale timeout based on epochs: more epochs = more time needed
    // Base: 90s, add 20s per epoch beyond 3
    const baseTimeout = 90000;
    const perEpochTimeout = epochs > 3 ? (epochs - 3) * 20000 : 0;
    const uploadTimeout = Math.min(baseTimeout + perEpochTimeout, 240000); // Cap at 4 minutes
    
    console.log(`Upload timeout: ${uploadTimeout}ms for ${epochs} epochs`);

    const { result, ms } = await timeIt("upload", async () => {
      return uploadWithTimeout(
        walrusClient,
        new Uint8Array(buffer),
        signer,
        uploadTimeout, // Dynamic timeout based on epochs
        2,     // max retries (reduced for faster failure)
        epochs // User-selected epochs for storage duration
      );
    });

    const blobId = result.blobId;
    const blobObjectId = result.blobObjectId || null;
    console.log(
      result.fromError
        ? `Upload succeeded (from timeout): ${blobId}`
        : `Upload complete: ${blobId}${blobObjectId ? ` (object: ${blobObjectId})` : ''}`
    );

    // Deduct payment after successful upload
    // Calculate cost if not provided
    if (costUSD === 0) {
      const sizeInGB = file.size / (1024 * 1024 * 1024);
      const costSUI = Math.max(sizeInGB * 0.001 * 3, 0.0000001); // min 0.0000001 SUI
      // Fetch SUI price (you may want to cache this)
      const { getSuiPriceUSD } = await import("@/utils/priceConverter");
      const suiPrice = await getSuiPriceUSD();
      costUSD = Math.max(costSUI * suiPrice, 0.01); // min $0.01
    }
    
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw new Error('User not found');
      }
      
      if (user.balance < costUSD) {
        throw new Error('Insufficient balance');
      }

      await prisma.user.update({
        where: { id: userId },
        data: { balance: { decrement: costUSD } },
      });
      console.log(`Deducted $${costUSD.toFixed(2)} from user ${userId} balance`);
    } catch (paymentErr: any) {
      console.error('Payment deduction failed:', paymentErr);
      return NextResponse.json(
        { error: `Upload succeeded but payment failed: ${paymentErr.message}` },
        { status: 500, headers: withCORS(req) }
      );
    }

    // Always save file metadata to database
    await cacheService.init();
    const encryptedUserId = await cacheService['encryptUserId'](userId);
    
    // Cache the blob if enabled
    if (enableCache) {
      try {
        await cacheService.set(blobId, userId, buffer, {
          filename: file.name,
          originalSize,
          contentType: file.type,
          encrypted: userKeyEncrypted || masterKeyEncrypted,
          userKeyEncrypted,
          masterKeyEncrypted,
          blobObjectId,
          epochs,
        });
        console.log(`Cached blob ${blobId}`);
      } catch (cacheErr) {
        console.warn(`Caching failed (non-fatal):`, cacheErr);
      }
    } else {
      // Not caching, but still save metadata to database
      try {
        await prisma.file.create({
          data: {
            blobId,
            blobObjectId,
            userId,
            encryptedUserId,
            filename: file.name,
            originalSize,
            contentType: file.type || 'application/octet-stream',
            encrypted: userKeyEncrypted || masterKeyEncrypted,
            userKeyEncrypted,
            masterKeyEncrypted,
            epochs,
            cached: false,
            uploadedAt: new Date(),
            lastAccessedAt: new Date(),
          }
        });
        console.log(`Saved file metadata to database: ${blobId}`);
      } catch (dbErr) {
        console.warn(`Database save failed (non-fatal):`, dbErr);
      }
    }

    // optional metric logging
    void logMetric({
      kind: "upload",
      ts: Date.now(),
      filename: file.name,
      bytes: file.size,
      durationMs: ms,
      lazy: lazyFlag === "true",
      cached: enableCache,
      encrypted: userKeyEncrypted || masterKeyEncrypted,
      success: true,
    });

    return NextResponse.json(
      {
        message: "SUCCESS: File uploaded successfully!",
        blobId,
        status: "confirmed",
        durationMs: ms,
        cached: enableCache,
        encrypted: userKeyEncrypted || masterKeyEncrypted,
        encryptionMetadata,
      },
      { status: 200, headers: withCORS(req) }
    );
    */ // END SYNC MODE (commented out)
  } catch (err: any) {
    console.error("Upload error:", err);
    void logMetric({
      kind: "upload",
      ts: Date.now(),
      error: String(err?.message ?? err),
      success: false,
    });

    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function GET(req: Request) {
  return NextResponse.json(
    { message: "Upload route is alive!" },
    { headers: withCORS(req) }
  );
}
