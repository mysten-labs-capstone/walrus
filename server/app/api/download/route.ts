import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";
import { s3Service, type S3StreamResult } from "@/utils/s3Service";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

function createWalrusStream(
  walrusClient: any,
  blobId: string,
): ReadableStream<Uint8Array> {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      controller = ctrl;
      
      try {
        // Try to use getSlivers first - it handles parallel fetching internally
        // and may provide better error handling with node switching
        let blobData: Uint8Array | null = null;
        
        if (typeof walrusClient.getSlivers === 'function') {
          try {
            const sliversResult = await walrusClient.getSlivers({ blobId });
            
            // Extract blob data from result
            if (sliversResult instanceof Uint8Array) {
              blobData = sliversResult;
            } else if (Array.isArray(sliversResult)) {
              blobData = new Uint8Array(sliversResult);
            } else if (sliversResult?.blob) {
              const data = sliversResult.blob;
              blobData = data instanceof Uint8Array ? data : new Uint8Array(data);
            } else if (sliversResult?.data) {
              const data = sliversResult.data;
              blobData = data instanceof Uint8Array ? data : new Uint8Array(data);
            } else if (sliversResult?.contents) {
              const data = sliversResult.contents;
              blobData = data instanceof Uint8Array ? data : new Uint8Array(data);
            }
          } catch (sliverErr: any) {
            // getSlivers failed - will fall back to readBlob
            console.warn(`[WalrusStream] getSlivers failed: ${sliverErr.message}, falling back to readBlob`);
          }
        }

        // Fallback to readBlob if getSlivers didn't work or isn't available
        if (!blobData) {
          const bytes = await walrusClient.readBlob({ blobId });
          blobData = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        }

        if (!blobData || blobData.length === 0) {
          controller.close();
          return;
        }

        // Stream in chunks for incremental delivery
        // Use 128KB chunks for better throughput while still being responsive
        const chunkSize = 128 * 1024;
        for (let offset = 0; offset < blobData.length && !cancelled; offset += chunkSize) {
          const chunk = blobData.slice(offset, Math.min(offset + chunkSize, blobData.length));
          controller.enqueue(chunk);
          
          // Yield control periodically to prevent blocking
          if (offset % (chunkSize * 4) === 0) {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
        
        if (!cancelled) {
          controller.close();
        }
      } catch (err: any) {
        if (!cancelled) {
          controller.error(err);
        }
      }
    },
    
    cancel() {
      cancelled = true;
    },
  });

  return stream;
}

async function streamWalrusBlob(
  walrusClient: any,
  blobId: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentLength?: number }> {
  // Try to get metadata first to determine size
  let contentLength: number | undefined;
  try {
    const metadata = await walrusClient.getBlobMetadata?.({ blobId });
    if (metadata?.metadata?.V1?.unencoded_length) {
      // Extract unencoded length from metadata
      const size = metadata.metadata.V1.unencoded_length;
      contentLength = typeof size === 'string' ? parseInt(size, 10) : Number(size);
    } else if (metadata?.size) {
      contentLength = typeof metadata.size === 'string' ? parseInt(metadata.size, 10) : Number(metadata.size);
    }
  } catch {
    // Metadata fetch failed, continue without size
  }

  // Create streaming download with parallel sliver fetching
  // getSlivers handles node switching and alternate sliver fetching internally
  const stream = createWalrusStream(walrusClient, blobId);
  
  return { stream, contentLength };
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
    const { blobId, filename, userId, shareId, preferPresignedUrl } = body ?? {};

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
    let fromS3 = false;
    let s3StreamResult: S3StreamResult | null = null;

    // PRIORITY 1: Try S3 FIRST. If the file exists in S3, stream it immediately (no buffering).
    // On NoSuchKey/404, fall back to Walrus without retrying. On other errors, retry once then Walrus.
    // Optional: preferPresignedUrl returns a direct S3 URL so client downloads from S3 (faster on prod).
    if (fileRecord?.s3Key && s3Service.isEnabled()) {
      if (preferPresignedUrl) {
        try {
          const expiresIn = 300; // 5 minutes
          const downloadUrl = await s3Service.getPresignedDownloadUrl(fileRecord.s3Key, expiresIn);
          return NextResponse.json(
            {
              downloadUrl,
              downloadName,
              expiresIn,
              message: "Open downloadUrl in browser or use as redirect for direct S3 download.",
            },
            { status: 200, headers: withCORS(req) },
          );
        } catch (presignErr: any) {
          console.warn(`[download] Presigned URL failed, falling back to stream: ${presignErr?.message}`);
          // Fall through to stream path
        }
      }

      const maxAttempts = Number(process.env.S3_DOWNLOAD_RETRIES || 2);
      // On high-latency prod (e.g. VM far from bucket), increase S3_DOWNLOAD_TIMEOUT_MS (e.g. 30000)
      const perAttemptTimeout = Number(
        process.env.S3_DOWNLOAD_TIMEOUT_MS || 15000,
      );
      let attempt = 0;
      let lastS3Error: any = null;

      while (attempt < maxAttempts && !s3StreamResult) {
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
        !s3StreamResult &&
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

      if (!s3StreamResult && lastS3Error) {
        console.warn("S3 download failed; will try Walrus fallback");
      }
    }

    // PRIORITY 2: Skip local cache (removed). Fall through to Walrus if S3 failed.

    // PRIORITY 3: Try Walrus (if S3 failed) - STREAMING, NO BUFFERING
    if (!s3StreamResult) {
      try {
        const { walrusClient } = await initWalrus();
        const walrusStreamResult = await streamWalrusBlob(walrusClient, blobId);

        // Stream Walrus response exactly like S3 - no buffering
        const isAscii = /^[\x00-\x7F]*$/.test(downloadName);
        const contentDisposition = isAscii
          ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
          : `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
        
        const headers: Record<string, string> = {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": contentDisposition,
          "Cache-Control": "no-store",
          "X-From-Cache": "false",
          "X-From-S3": "false",
          "X-From-Walrus": "true",
          "X-Decrypted": "false",
        };

        // Add Content-Length if we have it from metadata
        if (walrusStreamResult.contentLength !== undefined) {
          headers["Content-Length"] = String(walrusStreamResult.contentLength);
        }

        return new Response(walrusStreamResult.stream, {
          status: 200,
          headers: withCORS(req, headers),
        });
      } catch (walrusErr: any) {
        console.error(
          `Walrus download failed for ${blobId}:`,
          walrusErr?.message,
        );

        // Last resort: try S3 again if we haven't already
        if (!fromS3 && fileRecord?.s3Key && s3Service.isEnabled()) {
          try {
            const s3Stream = await s3Service.getObjectStream(fileRecord.s3Key);
            fromS3 = true;
            
            const isAscii = /^[\x00-\x7F]*$/.test(downloadName);
            const contentDisposition = isAscii
              ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
              : `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`;
            
            return new Response(s3Stream.body, {
              status: 200,
              headers: withCORS(req, {
                "Content-Type": "application/octet-stream",
                "Content-Length": String(s3Stream.contentLength),
                "Content-Disposition": contentDisposition,
                "Cache-Control": "no-store",
                "X-From-Cache": "false",
                "X-From-S3": "true",
                "X-Decrypted": "false",
              }),
            });
          } catch (s3FallbackErr) {
            console.error(`S3 fallback also failed:`, s3FallbackErr);
          }
        }

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

    // This should never be reached since we return early from S3 or Walrus paths
    return NextResponse.json(
      { error: "Download failed - no data source available" },
      { status: 500, headers: withCORS(req) },
    );
  } catch (err: any) {
    throw err;
  }
}
