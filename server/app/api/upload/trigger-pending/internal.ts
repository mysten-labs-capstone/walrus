import prisma from "../../_utils/prisma";

/**
 * Trigger background jobs for all pending files
 * Called by Vercel Cron every minute OR manually via POST
 *
 * Strategy:
 * 1. Process up to 6 files concurrently (max 2 per user)
 * 2. Prioritize small files first (faster uploads, less server load)
 * 3. Defer large files until small file queue is empty
 * 4. Retry failed files only after pending files are processed
 */
const STALE_PROCESSING_MS = 5 * 60 * 1000; // 5 minutes — process-async maxDuration is 3 min
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50 MB — defer files larger than this
const MAX_GLOBAL_CONCURRENT = 6; // Max uploads across all users
const MAX_PER_USER_CONCURRENT = 2; // Max uploads per user

/**
 * Core processing logic - can be called internally or via HTTP
 */
export async function processPendingFilesInternal() {
  try {
    // Unstick any files stuck in "processing" for longer than STALE_PROCESSING_MS.
    // This happens when the server crashes, Render kills the process, or the request times out
    // without updating the DB status. Without this, one stuck file blocks the entire queue forever.
    const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MS);
    const staleFiles = await prisma.file.updateMany({
      where: {
        status: "processing",
        uploadedAt: { lt: staleThreshold },
      },
      data: { status: "failed" },
    });
    if (staleFiles.count > 0) {
    }

    // Check if any file is already being processed and count per-user uploads
    const processingFiles = await prisma.file.findMany({
      where: { status: "processing" },
      select: { userId: true },
    });

    const processingCount = processingFiles.length;
    const processingByUser = new Map<string, number>();
    for (const file of processingFiles) {
      if (file.userId) {
        processingByUser.set(
          file.userId,
          (processingByUser.get(file.userId) || 0) + 1,
        );
      }
    }

    // Calculate how many more files we can process
    const availableSlots = MAX_GLOBAL_CONCURRENT - processingCount;

    if (availableSlots <= 0) {
      return {
        message: `Skipping — ${processingCount} file(s) already processing on Walrus (max ${MAX_GLOBAL_CONCURRENT})`,
        skipped: true,
        stats: {
          processing: processingCount,
          maxGlobal: MAX_GLOBAL_CONCURRENT,
          maxPerUser: MAX_PER_USER_CONCURRENT,
        },
      };
    }

    // Check total pending and failed files for debugging
    const totalPending = await prisma.file.count({
      where: { status: "pending" },
    });
    const totalFailed = await prisma.file.count({
      where: { status: "failed" },
    });

    // Inspect first pending file for debugging
    const firstPending = await prisma.file.findFirst({
      where: { status: "pending" },
      select: {
        id: true,
        filename: true,
        s3Key: true,
        originalSize: true,
        uploadedAt: true,
      },
    });

    if (firstPending) {
    }

    // Fetch more files than available slots to ensure we can fill all slots
    // even if some users hit their per-user limit
    const fetchLimit = availableSlots * 3;

    // Priority: pending small files first (< LARGE_FILE_THRESHOLD)
    // This ensures fast, small uploads are processed quickly while large files wait
    let candidateFiles = await prisma.file.findMany({
      where: {
        status: "pending",
        originalSize: { lt: LARGE_FILE_THRESHOLD },
      },
      orderBy: [
        { originalSize: "asc" }, // smallest first
        { uploadedAt: "asc" }, // FIFO for same size
      ],
      select: {
        id: true,
        userId: true,
        filename: true,
        s3Key: true,
        originalSize: true,
        blobId: true,
        epochs: true,
        uploadedAt: true,
      },
      take: fetchLimit,
    });

    // If no small pending files, try large pending files
    if (candidateFiles.length === 0) {
      candidateFiles = await prisma.file.findMany({
        where: {
          status: "pending",
          originalSize: { gte: LARGE_FILE_THRESHOLD },
        },
        orderBy: [
          { originalSize: "asc" }, // smallest of the large files first
          { uploadedAt: "asc" }, // FIFO for same size
        ],
        select: {
          id: true,
          userId: true,
          filename: true,
          s3Key: true,
          originalSize: true,
          blobId: true,
          epochs: true,
          uploadedAt: true,
        },
        take: fetchLimit,
      });

      if (candidateFiles.length > 0) {
        const fileSizeMB = (
          candidateFiles[0].originalSize /
          (1024 * 1024)
        ).toFixed(2);
      }
    }

    // If no pending files, fall through to retry failed files (small first, then large)
    if (candidateFiles.length === 0) {
      candidateFiles = await prisma.file.findMany({
        where: { status: "failed" },
        orderBy: [
          { originalSize: "asc" }, // smallest first
          { uploadedAt: "asc" }, // FIFO for same size
        ],
        select: {
          id: true,
          userId: true,
          filename: true,
          s3Key: true,
          originalSize: true,
          blobId: true,
          epochs: true,
          uploadedAt: true,
        },
        take: fetchLimit,
      });
    }

    // Select files to process, respecting per-user limits
    const filesToProcess = [] as Array<{
      id: string;
      userId: string | null;
      filename: string;
      s3Key: string | null;
      originalSize: number;
      blobId: string;
      epochs: number | null;
      uploadedAt: Date;
    }>;
    const userCounts = new Map(processingByUser); // Copy of current processing counts

    for (const file of candidateFiles) {
      if (filesToProcess.length >= availableSlots) {
        break; // Hit global limit
      }

      const userId = file.userId || "unknown";
      const userCount = userCounts.get(userId) || 0;

      if (userCount >= MAX_PER_USER_CONCURRENT) {
        continue; // User has hit their limit
      }

      filesToProcess.push(file);
      userCounts.set(userId, userCount + 1);
    }

    // Log which users are getting files processed
    const userFileCounts = new Map<string, number>();
    for (const file of filesToProcess) {
      const userId = file.userId || "unknown";
      userFileCounts.set(userId, (userFileCounts.get(userId) || 0) + 1);
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_API_BASE ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "http://169.231.231.63:3000");
    const results = [] as Array<Record<string, any>>;

    for (const file of filesToProcess) {
      const fileSizeMB = (file.originalSize / (1024 * 1024)).toFixed(2);

      try {
        const response = await fetch(`${baseUrl}/api/upload/process-async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            s3Key: file.s3Key,
            tempBlobId: file.blobId,
            userId: file.userId,
            epochs: file.epochs || 3,
          }),
        });

        const responseBody = await response.text();
        if (!response.ok) {
          console.error(
            `[TRIGGER] process-async failed: ${response.status} ${responseBody}`,
          );
        }

        results.push({
          fileId: file.id,
          filename: file.filename,
          size: file.originalSize,
          status: response.status,
          ok: response.ok,
        });
      } catch (err: any) {
        console.error(
          `[TRIGGER] Error calling process-async for ${file.filename}: ${err.message}`,
        );
        results.push({
          fileId: file.id,
          filename: file.filename,
          size: file.originalSize,
          error: err.message,
        });
      }
    }

    return {
      message: `Triggered ${results.length} background job(s) — ${processingCount + results.length}/${MAX_GLOBAL_CONCURRENT} slots used`,
      largeFileThresholdMB: LARGE_FILE_THRESHOLD / (1024 * 1024),
      stats: {
        triggered: results.length,
        alreadyProcessing: processingCount,
        totalActive: processingCount + results.length,
        maxGlobal: MAX_GLOBAL_CONCURRENT,
        maxPerUser: MAX_PER_USER_CONCURRENT,
        filesByUser: Object.fromEntries(userFileCounts),
      },
      results,
    };
  } catch (err: any) {
    console.error("[TRIGGER] Error:", err?.message || String(err));
    return { error: err.message || String(err), status: 500 };
  }
}
