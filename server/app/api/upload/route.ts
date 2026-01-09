import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import { encryptionService } from "@/utils/encryptionService";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";

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

// Helper function to upload with retries and verification
async function uploadWithTimeout(
  walrusClient: any,
  blob: Uint8Array,
  signer: any,
  timeoutMs: number = 60000,
  maxRetries: number = 3,
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
      
      // Verify blob exists before returning success
      const verified = await verifyBlobExists(walrusClient, blobId);
      if (verified) {
        console.log(`Upload successful on attempt ${attempt}: ${blobId}`);
        return { success: true, blobId };
      } else {
        console.warn(`Upload returned blobId but verification failed (attempt ${attempt})`);
        lastError = new Error(`Blob ${blobId} uploaded but not accessible`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // exponential backoff
          continue;
        }
      }
    } catch (err: any) {
      lastError = err;
      
      // If we got a blobId from error, verify it exists
      if (blobIdFromError) {
        console.log(`Got blobId from error (attempt ${attempt}): ${blobIdFromError}, verifying...`);
        const verified = await verifyBlobExists(walrusClient, blobIdFromError);
        if (verified) {
          console.log(`Error-extracted blobId verified: ${blobIdFromError}`);
          return { success: true, blobId: blobIdFromError, fromError: true };
        } else {
          console.warn(`Error-extracted blobId failed verification: ${blobIdFromError}`);
        }
      }
      
      // Retry if we have attempts left
      if (attempt < maxRetries) {
        console.log(`Retrying upload (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // exponential backoff
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

    console.log(`Uploading: ${file.name} (${file.size} bytes) for user ${userId}, epochs: ${epochs} (${epochs * 30} days)`);
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

    const { walrusClient, signer } = await initWalrus();

    const { result, ms } = await timeIt("upload", async () => {
      return uploadWithTimeout(
        walrusClient,
        new Uint8Array(buffer),
        signer,
        60000, // 60 second timeout
        3,     // max retries
        epochs // User-selected epochs for storage duration
      );
    });

    const blobId = result.blobId;
    console.log(
      result.fromError
        ? `Upload succeeded (from timeout): ${blobId}`
        : `Upload complete: ${blobId}`
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
            userId,
            encryptedUserId,
            filename: file.name,
            originalSize,
            contentType: file.type || 'application/octet-stream',
            encrypted: userKeyEncrypted || masterKeyEncrypted,
            userKeyEncrypted,
            masterKeyEncrypted,
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
