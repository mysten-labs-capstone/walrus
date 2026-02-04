import { NextResponse } from "next/server";
import prisma from "../../../api/_utils/prisma";
import { withCORS } from "../../../api/_utils/cors";

export const runtime = "nodejs";
export const maxDuration = 120; // 2 minutes (reduced from 5 minutes - cron only triggers jobs, doesn't do heavy work)

/**
 * Cron job to process pending uploads
 * Should be called every minute by a cron service (e.g., Vercel Cron, cron-job.org)
 *
 * Finds all files with status='pending' and triggers background processing
 */
export async function GET(req: Request) {

  try {
    // Find all pending files
    const pendingFiles = await prisma.file.findMany({
      where: { status: "pending" },
      select: {
        id: true,
        blobId: true,
        s3Key: true,
        userId: true,
        epochs: true,
        filename: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: "asc" }, // Process oldest first
      take: 1, // Process max 1 file per run to avoid CPU exhaustion (1 CPU limit on Render)
    });

    if (pendingFiles.length === 0) {
      return NextResponse.json(
        { message: "No pending files", processed: 0 },
        { status: 200, headers: withCORS(req) },
      );
    }

    const results = [];
    // Process files with delays to prevent server CPU exhaustion
    // Render has 1 CPU limit - staggering prevents CPU overload
    const DELAY_BETWEEN_FILES = 15000; // 15 seconds between background job triggers

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];

      try {
        // Call the background processor
        const baseUrl =
          process.env.NEXT_PUBLIC_API_BASE ||
          `http://localhost:${process.env.PORT || 3001}`;
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

        const result = await response.json();
        results.push({
          fileId: file.id,
          filename: file.filename,
          success: response.ok,
          status: response.status,
          result,
        });

        // Add delay between files (except after the last one)
        if (i < pendingFiles.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_FILES));
        }
      } catch (err: any) {
        results.push({
          fileId: file.id,
          filename: file.filename,
          success: false,
          error: err.message,
        });
        // Still add delay even on error to prevent overwhelming server
        if (i < pendingFiles.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_FILES));
        }
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return NextResponse.json(
      {
        message: `Processed ${successCount}/${pendingFiles.length} files`,
        processed: successCount,
        total: pendingFiles.length,
        results,
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[CRON] Error processing pending uploads:", err);
    return NextResponse.json(
      { error: err.message || "Failed to process pending uploads" },
      { status: 500, headers: withCORS(req) },
    );
  }
}

// Allow POST as well for manual triggers
export async function POST(req: Request) {
  return GET(req);
}
