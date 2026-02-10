import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import { s3Service } from "@/utils/s3Service";
import { calculateUploadCostUSD, deductPayment } from "@/utils/paymentService";
import prisma from "../_utils/prisma";

export const runtime = "nodejs";
export const maxDuration = 180; // 3 minutes (reduced from 5 minutes to prevent memory accumulation)

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
        (result as any).blobObject?.id?.id ||
        (result as any).blobObjectId ||
        (result as any).objectId ||
        null;

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

function buildDuplicateResponse(
  req: Request,
  existing: {
    id: string;
    blobId: string;
    status: string | null;
    encrypted: boolean;
  },
) {
  return NextResponse.json(
    {
      message: "Duplicate file detected (existing upload already tracked)",
      blobId: existing.blobId,
      fileId: existing.id,
      status: existing.status || "completed",
      uploadMode: "async",
      encrypted: existing.encrypted,
    },
    { status: 200, headers: withCORS(req) },
  );
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
    const fileId = formData.get("fileId") as string | null; // Blockchain file identifier (32-byte hex)
    const uploadMode = formData.get("uploadMode") as string | null; // "sync" (default) or "async"
    const folderId = formData.get("folderId") as string | null; // Target folder for upload

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

    if (fileId) {
      const existing = await prisma.file.findUnique({
        where: { fileId },
        select: {
          id: true,
          userId: true,
          blobId: true,
          status: true,
          encrypted: true,
        },
      });

      if (existing) {
        if (existing.userId !== userId) {
          return NextResponse.json(
            { error: "fileId already in use by another user" },
            { status: 409, headers: withCORS(req) },
          );
        }

        return buildDuplicateResponse(req, existing);
      }
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
    let paymentDeducted = false;
    if (s3Service.isEnabled()) {
      // Calculate cost if not provided
      if (costUSD === 0) {
        costUSD = await calculateUploadCostUSD(file.size, epochs);
      }

      // Pre-check balance without charging. Charge happens after Walrus success.
      const userBalance = await prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });
      if (!userBalance) {
        return NextResponse.json(
          { error: "User not found" },
          { status: 404, headers: withCORS(req) },
        );
      }
      if (userBalance.balance < costUSD) {
        return NextResponse.json(
          { error: "Insufficient balance" },
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

        let fileRecord;
        try {
          fileRecord = await prisma.file.create({
            data: {
              blobId: tempBlobId,
              blobObjectId: null,
              userId,
              encryptedUserId,
              fileId: fileId || null, // Blockchain identifier
              filename: file.name,
              originalSize,
              contentType: file.type || "application/octet-stream",
              encrypted,
              epochs,
              cached: false, // Will cache after Walrus upload
              uploadedAt: new Date(),
              lastAccessedAt: new Date(),
              s3Key: s3Key,
              status: "pending", // Will be picked up by cron job every minute
              folderId: folderId || undefined,
            },
          });
        } catch (dbErr: any) {
          if (dbErr?.code === "P2002" && fileId) {
            const existing = await prisma.file.findUnique({
              where: { fileId },
              select: {
                id: true,
                blobId: true,
                status: true,
                encrypted: true,
              },
            });

            if (existing) {
              try {
                await s3Service.delete(s3Key);
              } catch (cleanupErr) {
                console.warn(
                  "[upload] Failed to cleanup duplicate S3 object:",
                  cleanupErr,
                );
              }

              return buildDuplicateResponse(req, existing);
            }
          }

          throw dbErr;
        }

        // Trigger background job immediately (non-blocking, fire-and-forget)
        // Import and call the internal function directly
        setImmediate(async () => {
          try {
            const { processPendingFilesInternal } =
              await import("./trigger-pending/route");
            await processPendingFilesInternal();
          } catch (err) {
            // Silently fail - cron will pick it up anyway
            console.warn(
              "[upload] Failed to trigger immediate processing:",
              err,
            );
          }
        });

        // Return immediately - background job triggered
        return NextResponse.json(
          {
            message:
              "SUCCESS: File uploaded to S3, decentralization starting now!",
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
          // Other S3 errors - return error without charging
          console.error(`[ASYNC MODE] S3 upload failed: ${s3Err.message}`);
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

      // Calculate cost if not provided
      if (costUSD === 0) {
        costUSD = await calculateUploadCostUSD(file.size, epochs);
      }

      // Deduct payment after successful upload
      if (!paymentDeducted) {
        try {
          await deductPayment(userId, costUSD, `Upload: ${file.name}`);
          paymentDeducted = true;
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

      try {
        await prisma.file.create({
          data: {
            blobId,
            blobObjectId,
            userId,
            encryptedUserId,
            fileId: fileId || null, // Blockchain identifier
            filename: file.name,
            originalSize,
            contentType: file.type || "application/octet-stream",
            encrypted,
            epochs,
            cached: false,
            uploadedAt: new Date(),
            lastAccessedAt: new Date(),
            status: "completed",
            folderId: folderId || undefined,
          },
        });
      } catch (dbErr: any) {
        if (dbErr?.code === "P2002" && fileId) {
          const existing = await prisma.file.findUnique({
            where: { fileId },
            select: {
              id: true,
              blobId: true,
              status: true,
              encrypted: true,
            },
          });

          if (existing) {
            return buildDuplicateResponse(req, existing);
          }
        }

        throw dbErr;
      }

      // Clean up old failed/pending records with the same userId and filename
      // This prevents duplicate file entries when uploads are retried
      try {
        await prisma.file.deleteMany({
          where: {
            userId,
            filename: file.name,
            blobId: { not: blobId }, // Don't delete the record we just created
            status: { in: ["failed", "pending"] }, // Only delete failed or pending ones
          },
        });
      } catch (cleanupErr: any) {
        console.warn(
          "[upload] Failed to cleanup old failed records:",
          cleanupErr,
        );
        // Don't fail the upload if cleanup fails
      }

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
