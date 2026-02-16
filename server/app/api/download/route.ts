import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";
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
  initialDelayMs: number = 2000,
): Promise<Uint8Array> {
  let lastError: any;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const bytes = await walrusClient.readBlob({ blobId });

      if (bytes && bytes.length > 0) {
        return bytes;
      }
    } catch (err: any) {
      lastError = err;
      const isSliverError =
        err.message?.includes("slivers") || err.message?.includes("not enough");

      console.warn(
        `Attempt ${attempt}/${maxRetries} failed: ${err.message}${isSliverError ? " (replication in progress)" : ""}`,
      );

      if (attempt < maxRetries) {
        const waitTime = isSliverError
          ? Math.min(delayMs * 1.8, 8000)
          : Math.min(delayMs * 1.3, 4000);

        await new Promise((resolve) => setTimeout(resolve, waitTime));
        delayMs = waitTime;
      } else {
        if (isSliverError) {
          throw new Error(
            `File is still being replicated across storage nodes. This typically takes 30-90 seconds after upload. Please wait and try again in a moment.`,
          );
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
    setTimeout(
      () =>
        reject(
          new Error(
            "Download timeout - file may be too large or network is slow. Please try again or use a smaller file.",
          ),
        ),
      timeoutMs,
    ),
  );

  try {
    return (await Promise.race([
      handleDownload(req),
      timeoutPromise,
    ])) as Response;
  } catch (err: any) {
    console.error("Download error:", err);

    let errorMessage = err.message;
    if (err.message?.includes("slivers")) {
      errorMessage =
        "File is still being replicated across storage nodes. Please wait 30-60 seconds and try again.";
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: withCORS(req) },
    );
  }
}

async function handleDownload(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const { blobId, filename, userId, shareId } = body ?? {};

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) },
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
          filename: true,
          uploadedAt: true,
          status: true,
          s3Key: true,
        },
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
    if (
      fileRecord &&
      (fileRecord.status === "processing" || fileRecord.status === "pending") &&
      !fileRecord.s3Key
    ) {
      return NextResponse.json(
        {
          status: "processing",
          message:
            "File upload is still processing. Please retry in 30-60 seconds.",
          uploadedAt: fileRecord.uploadedAt,
        },
        { status: 202, headers: withCORS(req) },
      );
    }

    // If file is encrypted and user is not the owner, require userPrivateKey
    // UNLESS it's a share link download (shareId provided) - in that case, allow download
    // because decryption happens client-side with the key from the URL fragment
    if (fileRecord?.encrypted && !isOwner && !shareId) {
      return NextResponse.json(
        {
          error:
            "This file is encrypted. Please provide the encryption key to download.",
          requiresKey: true,
          isOwner: false,
        },
        { status: 403, headers: withCORS(req) },
      );
    }
    const downloadName =
      filename?.trim() || fileRecord?.filename || `${blobId}`;
    let bytes: Uint8Array | undefined;
    let fromCache = false;
    let fromS3 = false;

    // PRIORITY 1: Try S3 FIRST. If the file exists in S3, stream it immediately (no buffering).
    // On NoSuchKey/404, fall back to Walrus without retrying. On other errors, retry once then Walrus.
    if (fileRecord?.s3Key && s3Service.isEnabled()) {
      const maxAttempts = Number(process.env.S3_DOWNLOAD_RETRIES || 2);
      const perAttemptTimeout = Number(
        process.env.S3_DOWNLOAD_TIMEOUT_MS || 15000,
      );
      let attempt = 0;
      let lastS3Error: any = null;
      let s3StreamResult: Awaited<ReturnType<typeof s3Service.getObjectStream>> | null = null;

      while (attempt < maxAttempts && !bytes && !s3StreamResult) {
        attempt++;
        try {
          const streamPromise = s3Service.getObjectStream(fileRecord.s3Key);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("S3 download timeout")),
              perAttemptTimeout,
            ),
          );
          s3StreamResult = await Promise.race([streamPromise, timeoutPromise]);
          fromS3 = true;
          break;
        } catch (s3Err: any) {
          lastS3Error = s3Err;
          const isNoSuchKey =
            s3Err?.name === "NoSuchKey" ||
            s3Err?.Code === "NoSuchKey" ||
            s3Err?.$metadata?.httpStatusCode === 404;
          if (isNoSuchKey) {
            // File not in S3 (e.g. sync upload); skip retries and use Walrus
            lastS3Error = s3Err;
            break;
          }
          console.warn(
            `S3 download attempt ${attempt} failed: ${s3Err?.message || s3Err}`,
          );

          // Re-check DB status; if completed, stop retrying S3 and try Walrus
          try {
            const refreshed = await prisma.file.findUnique({
              where: { blobId },
              select: { status: true, s3Key: true },
            });
            if (refreshed) {
              fileRecord.status = refreshed.status as typeof fileRecord.status;
              fileRecord.s3Key = refreshed.s3Key;
              if (refreshed.status === "completed") break;
            }
          } catch {
            /* ignore */
          }

          if (attempt < maxAttempts) {
            const waitMs = Math.min(1000 * Math.pow(1.5, attempt), 3000);
            await new Promise((res) => setTimeout(res, waitMs));
          }
        }
      }

      // If we got a stream, return immediately (fast path – no buffering)
      if (s3StreamResult) {
        const isAscii = /^[\x00-\x7F]*$/.test(downloadName);
        const contentDisposition = isAscii
          ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
          : `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
        const headers = withCORS(req, {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(s3StreamResult.contentLength),
          "Content-Disposition": contentDisposition,
          "Cache-Control": "no-store",
          "X-From-S3": "true",
          "X-From-Cache": "false",
          "X-Decrypted": "false",
        });
        return new Response(s3StreamResult.body, { status: 200, headers });
      }

      if (
        !bytes &&
        fileRecord &&
        (fileRecord.status === "processing" || fileRecord.status === "pending")
      ) {
        return NextResponse.json(
          {
            status: "processing",
            message:
              "File upload is still processing. Please retry in 30-60 seconds.",
            uploadedAt: fileRecord.uploadedAt,
            s3Error: lastS3Error?.message || String(lastS3Error || ""),
          },
          { status: 202, headers: withCORS(req) },
        );
      }

      if (!bytes && lastS3Error) {
        console.warn("S3 download failed; will try Walrus fallback");
      }
    }

    // PRIORITY 2: Skip local cache (removed). Fall through to Walrus if S3 failed.

    // PRIORITY 3: Try Walrus (if S3 and cache both failed)
    if (!bytes) {
      try {
        const { walrusClient } = await initWalrus();
        bytes = await downloadWithRetry(walrusClient, blobId, 8, 2000);

        // Skipping caching to avoid cache-related errors (cache removed)
      } catch (walrusErr: any) {
        console.error(
          `Walrus download failed for ${blobId}:`,
          walrusErr?.message,
        );

        // Last resort: try S3 again if we haven't already
        if (!fromS3 && fileRecord?.s3Key && s3Service.isEnabled()) {
          try {
            const s3Buffer = await s3Service.download(fileRecord.s3Key);
            bytes = new Uint8Array(s3Buffer);
            fromS3 = true;
          } catch (s3FallbackErr) {
            console.error(`S3 fallback also failed:`, s3FallbackErr);
          }
        }

        if (!bytes) {
          // If file was recently uploaded, provide helpful message
          if (fileRecord) {
            const uploadedAt = new Date(fileRecord.uploadedAt || 0);
            const ageSeconds = (Date.now() - uploadedAt.getTime()) / 1000;

            if (
              ageSeconds < 120 ||
              walrusErr?.message?.includes("metadata") ||
              walrusErr?.message?.includes("slivers")
            ) {
              throw new Error(
                `File is still being replicated to storage nodes (uploaded ${Math.floor(ageSeconds)}s ago). Please wait 30-60 seconds and try again.`,
              );
            }
          }

          if (walrusErr?.message?.includes("metadata")) {
            throw new Error(
              "Unable to retrieve file from storage network. The file may not exist or is still being uploaded.",
            );
          }

          throw walrusErr;
        }
      }
    }

    if (!bytes || bytes.length === 0) {
      return NextResponse.json(
        { error: "Blob had no data" },
        { status: 404, headers: withCORS(req) },
      );
    }

    const finalBytes = bytes;
    const decrypted = false; // Server-side decryption removed - E2E only

    // At this point, bytes should contain the file data
    if (bytes) {
      // Log first 16 bytes for debugging
      const headerBytes = Array.from(bytes.slice(0, 16))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join(" ");
    }

    // Content-Disposition must be ASCII-safe when set as a header value. If the
    // filename contains non-ASCII chars (e.g. narrow no-break space U+202F),
    // the header construction can fail when converting to a ByteString. Use
    // RFC5987 encoding (filename*) for UTF-8 filenames as a safe alternative.
    const isAscii = /^[\x00-\x7F]*$/.test(downloadName);
    const contentDisposition = isAscii
      ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
      : `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;

    const headers = withCORS(req, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(finalBytes.length),
      "Content-Disposition": contentDisposition,
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
