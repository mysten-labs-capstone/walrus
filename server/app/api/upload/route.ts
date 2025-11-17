import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import { cacheService } from "@/utils/cacheService";
import { encryptionService } from "@/utils/encryptionService";
import prisma from "../_utils/prisma";

// Used Emojis: 💬 ❗

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

// Helper function to extract blobId even from error
async function uploadWithTimeout(
  walrusClient: any,
  blob: Uint8Array,
  signer: any,
  timeoutMs: number = 60000
) {
  let blobIdFromError: string | null = null;

  const uploadPromise = walrusClient
    .writeBlob({
      blob,
      signer,
      epochs: 3,
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
    return { success: true, blobId: (result as any).blobId };
  } catch (err: any) {
    if (blobIdFromError) {
      return { success: true, blobId: blobIdFromError, fromError: true };
    }
    throw err;
  }
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

    console.log(`💬 Uploading: ${file.name} (${file.size} bytes) for user ${userId}`);
    let buffer = Buffer.from(await file.arrayBuffer());
    const originalSize = buffer.length;
    let userKeyEncrypted = false;
    let masterKeyEncrypted = false;
    let encryptionMetadata: any = null;

    // Handle server-side encryption if requested
    if (encryptOnServer && userPrivateKey) {
      console.log(`🔒 Encrypting on server with dual keys...`);
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
      
      console.log(`✅ Encrypted: ${buffer.length} bytes`);
    }

    const { walrusClient, signer } = await initWalrus();

    const { result, ms } = await timeIt("upload", async () => {
      return uploadWithTimeout(
        walrusClient,
        new Uint8Array(buffer),
        signer,
        25000
      );
    });

    const blobId = result.blobId;
    console.log(
      result.fromError
        ? `💬 Upload succeeded (from timeout): ${blobId}`
        : `💬 Upload complete: ${blobId}`
    );

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
        console.log(`💾 Cached blob ${blobId}`);
      } catch (cacheErr) {
        console.warn(`⚠️  Caching failed (non-fatal):`, cacheErr);
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
        console.log(`💾 Saved file metadata to database: ${blobId}`);
      } catch (dbErr) {
        console.warn(`⚠️  Database save failed (non-fatal):`, dbErr);
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
    console.error("❗ Upload error:", err);
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
