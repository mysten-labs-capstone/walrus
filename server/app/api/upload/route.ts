import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import { s3Service } from "@/utils/s3Service";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

// Memory protection: Render free tier has 2GB RAM
// Limit file size to 100MB to prevent OOM crashes
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

// Track background job triggers to stagger them
let backgroundJobCounter = 0;

// Optional helper to measure time
async function timeIt<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ result: T; ms: number }> {
  const t0 = performance.now?.() ?? Date.now();
  const result = await fn();
  const t1 = performance.now?.() ?? Date.now();
  const ms = t1 - t0;
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
async function verifyBlobExists(
  walrusClient: any,
  blobId: string,
): Promise<boolean> {
  try {
    const bytes = await walrusClient.readBlob({ blobId });
    if (bytes && bytes.length > 0) {
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
  epochs: number = 3,
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
      setTimeout(() => reject(new Error("Upload timeout")), timeoutMs),
    );

    try {
      const result = await Promise.race([uploadPromise, timeoutPromise]);
      const blobId = (result as any).blobId;
      const blobObjectId =
        (result as any).blobObjectId || (result as any).objectId || null;

      if (blobObjectId) {
      }

      // Skip verification for faster response - Walrus writeBlob success means it's stored
      return { success: true, blobId, blobObjectId };
    } catch (err: any) {
      lastError = err;

      // If we got a blobId from error, trust it (common with Walrus timeouts)
      if (blobIdFromError) {
        return {
          success: true,
          blobId: blobIdFromError,
          fromError: true,
          blobObjectId: null,
        };
      }

      // Retry if we have attempts left
      if (attempt < maxRetries) {
        const backoffMs = 1000 * attempt; // Shorter backoff: 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
    }
  }

  throw lastError || new Error("Upload failed after all retries");
}

// Helper: Deduct payment in a single query (no findUnique first)
// Returns { success: true, newBalance } or throws with error message
async function deductPayment(
  userId: string,
  costUSD: number,
  description: string,
): Promise<{ success: boolean; newBalance: number }> {
  // Use a transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Fetch balance only once
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { balance: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    if (user.balance < costUSD) {
      throw new Error("Insufficient balance");
    }

    // Update balance atomically
    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: costUSD } },
      select: { balance: true },
    });

    // Create transaction record
    await tx.transaction.create({
      data: {
        userId,
        amount: -costUSD,
        currency: "USD",
        type: "debit",
        description,
        balanceAfter: updatedUser.balance,
      },
    });

    return { success: true, newBalance: updatedUser.balance };
  });

  return result;
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
    const enableCache = formData.get("enableCache") !== "false"; // default true
    const paymentAmount = formData.get("paymentAmount") as string | null; // USD cost
    const clientSideEncrypted = formData.get("clientSideEncrypted") === "true";
    const epochsParam = formData.get("epochs") as string | null; // User-selected storage duration
    const uploadMode = formData.get("uploadMode") as string | null; // "sync" (default) or "async"
    const wrappedFileKey = formData.get("wrappedFileKey") as string | null; // E2E: wrapped file encryption key

    // Parse epochs: default to 3 (90 days) if not provided, validate it's a positive integer
    const epochs =
      epochsParam && parseInt(epochsParam, 10) > 0
        ? Math.floor(parseInt(epochsParam, 10))
        : 3;

    if (!file) {
      return NextResponse.json(
        { error: "Missing file" },
        { status: 400, headers: withCORS(req) },
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) },
      );
    }

    // Enforce file size limit to prevent memory issues (Render has 2GB RAM)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        },
        { status: 413, headers: withCORS(req) },
      );
    }

    // Payment amount is optional - will calculate from file size if not provided
    let costUSD = paymentAmount ? parseFloat(paymentAmount) : 0;

    // Convert file to buffer - this is CPU intensive, do it asynchronously if possible
    const buffer = Buffer.from(await file.arrayBuffer());
    const originalSize = buffer.length;
    const encrypted = clientSideEncrypted; // E2E: encrypted on client only

    // ASYNC MODE: Always use S3 first for instant uploads, then Walrus in background
    let s3UploadFailed = false;
    if (s3Service.isEnabled()) {
      // Calculate cost if not provided
      if (costUSD === 0) {
        const sizeInGB = file.size / (1024 * 1024 * 1024);
        const costSUI = Math.max(sizeInGB * 0.001 * epochs, 0.0000001); // min 0.0000001 SUI
        // Fetch SUI price (you may want to cache this)
        const { getSuiPriceUSD } = await import("@/utils/priceConverter");
        const suiPrice = await getSuiPriceUSD();
        costUSD = Math.max(costSUI * suiPrice, 0.01); // min $0.01
      }

      // Deduct payment BEFORE upload (optimistic - we'll refund if upload fails)
      try {
        await deductPayment(userId, costUSD, `Upload: ${file.name}`);
      } catch (paymentErr: any) {
        console.error("[ASYNC MODE] Payment deduction failed:", paymentErr);
        return NextResponse.json(
          { error: `Payment failed: ${paymentErr.message}` },
          { status: 400, headers: withCORS(req) },
        );
      }

      // Generate temp blob ID
      const tempBlobId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const s3Key = s3Service.generateKey(userId, tempBlobId, file.name);

      // Upload to S3 (fast!)
      try {
        await s3Service.upload(s3Key, buffer, {
          contentType: file.type || "application/octet-stream",
          userId,
          filename: file.name,
          encrypted: String(encrypted),
          epochs: String(epochs),
        });
        // Save metadata with pending status
        await cacheService.init();
        const encryptedUserId = await cacheService["encryptUserId"](userId);

        const fileRecord = await prisma.file.create({
          data: {
            blobId: tempBlobId,
            blobObjectId: null,
            userId,
            encryptedUserId,
            filename: file.name,
            originalSize,
            contentType: file.type || "application/octet-stream",
            encrypted,
            wrappedFileKey: wrappedFileKey || null, // E2E: save wrapped file key for owner decryption
            epochs,
            cached: false, // Will cache after Walrus upload
            uploadedAt: new Date(),
            lastAccessedAt: new Date(),
            s3Key: s3Key,
            status: "pending", // Will be picked up by cron job every minute
          },
        });

        // Return immediately - cron job will handle Walrus upload
        return NextResponse.json(
          {
            message:
              "SUCCESS: File uploaded to S3, Walrus upload will start within 1 minute!",
            blobId: tempBlobId,
            fileId: fileRecord.id,
            status: "pending",
            uploadMode: "async",
            s3Key,
            encrypted,
          },
          { status: 200, headers: withCORS(req) },
        );
      } catch (s3Err: any) {
        // If S3 upload fails due to credentials, disable S3 and fall through to sync mode
        if (
          s3Err?.message?.includes("credentials") ||
          s3Err?.message?.includes("profile") ||
          s3Err?.message?.includes("Could not resolve")
        ) {
          console.warn(
            `[ASYNC MODE] S3 upload failed due to credentials: ${s3Err.message}`,
          );
          console.warn(
            `[ASYNC MODE] Falling back to direct Walrus upload (sync mode)`,
          );
          // Disable S3 service to prevent future attempts
          (s3Service as any).enabled = false;
          s3UploadFailed = true;
          // Continue to sync mode below - payment already deducted, so we'll proceed with upload
        } else {
          // Other S3 errors - refund payment and return error
          console.error(`[ASYNC MODE] S3 upload failed: ${s3Err.message}`);
          // Refund payment
          try {
            await prisma.user.update({
              where: { id: userId },
              data: { balance: { increment: costUSD } },
            });
            await prisma.transaction.create({
              data: {
                userId,
                amount: costUSD,
                currency: "USD",
                type: "credit",
                description: `Refund: S3 upload failed for ${file.name}`,
              },
            });
          } catch (refundErr) {
            console.error("[ASYNC MODE] Failed to refund payment:", refundErr);
          }
          return NextResponse.json(
            { error: `S3 upload failed: ${s3Err.message}` },
            { status: 500, headers: withCORS(req) },
          );
        }
      }
    }

    // FALLBACK: If S3 is not enabled or failed, use direct Walrus upload (sync mode)
    if (!s3Service.isEnabled() || s3UploadFailed) {

      const { walrusClient, signer } = await initWalrus();

      // Scale timeout based on epochs
      const baseTimeout = 90000;
      const perEpochTimeout = epochs > 3 ? (epochs - 3) * 20000 : 0;
      const uploadTimeout = Math.min(baseTimeout + perEpochTimeout, 240000);

      const { result, ms } = await timeIt("upload", async () => {
        return uploadWithTimeout(
          walrusClient,
          new Uint8Array(buffer),
          signer,
          uploadTimeout,
          2,
          epochs,
        );
      });

      const blobId = result.blobId;
      const blobObjectId = result.blobObjectId || null;

      // Calculate cost if not provided (only if payment wasn't already deducted)
      if (costUSD === 0) {
        const sizeInGB = file.size / (1024 * 1024 * 1024);
        const costSUI = Math.max(sizeInGB * 0.001 * epochs, 0.0000001);
        const { getSuiPriceUSD } = await import("@/utils/priceConverter");
        const suiPrice = await getSuiPriceUSD();
        costUSD = Math.max(costSUI * suiPrice, 0.01);
      }

      // Deduct payment after successful upload (only if not already deducted in async mode)
      if (!s3UploadFailed) {
        try {
          await deductPayment(userId, costUSD, `Upload: ${file.name}`);
        } catch (paymentErr: any) {
          return NextResponse.json(
            {
              error: `Upload succeeded but payment failed: ${paymentErr.message}`,
            },
            { status: 500, headers: withCORS(req) },
          );
        }
      }

      // Save file metadata
      await cacheService.init();
      const encryptedUserId = await cacheService["encryptUserId"](userId);

      await prisma.file.create({
        data: {
          blobId,
          blobObjectId,
          userId,
          encryptedUserId,
          filename: file.name,
          originalSize,
          contentType: file.type || "application/octet-stream",
          encrypted,
          wrappedFileKey: wrappedFileKey || null,
          epochs,
          cached: false,
          uploadedAt: new Date(),
          lastAccessedAt: new Date(),
          status: "completed",
        },
      });
      return NextResponse.json(
        {
          message: "SUCCESS: File uploaded successfully!",
          blobId,
          status: "confirmed",
          durationMs: ms,
          cached: false,
          encrypted,
          uploadMode: "sync",
        },
        { status: 200, headers: withCORS(req) },
      );
    }

  } catch (err: any) {
    void logMetric({
      kind: "upload",
      ts: Date.now(),
      error: String(err?.message ?? err),
      success: false,
    }).catch(() => {}); // Don't let metric logging failures break the response

    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500, headers: withCORS(req) },
    );
  }
}

export async function GET(req: Request) {
  return NextResponse.json(
    { message: "Upload route is alive!" },
    { headers: withCORS(req) },
  );
}
