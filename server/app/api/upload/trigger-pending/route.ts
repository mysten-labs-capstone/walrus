import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

/**
 * Trigger background jobs for all pending files
 * Called by Vercel Cron every minute OR manually via POST
 */
async function processPendingFiles(req: Request) {
  try {
    const pendingFiles = await prisma.file.findMany({
      where: { status: "pending" },
      orderBy: { uploadedAt: "desc" },
      take: 2, // Reduced to prevent CPU exhaustion (1 CPU limit on Render)
    });

    console.log(`[TRIGGER] Found ${pendingFiles.length} pending files`);

    const baseUrl =
      process.env.NEXT_PUBLIC_API_BASE ||
      (process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : "https://walrus-jpfl.onrender.com");
    const results = [];

    // Process files with delays to prevent server CPU exhaustion
    // Render has 1 CPU limit - staggering prevents CPU overload
    const DELAY_BETWEEN_FILES = 10000; // 10 seconds between background job triggers

    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
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

        results.push({
          fileId: file.id,
          filename: file.filename,
          status: response.status,
          ok: response.ok,
        });

        // Add delay between files (except after the last one)
        if (i < pendingFiles.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_FILES),
          );
        }
      } catch (err: any) {
        results.push({
          fileId: file.id,
          filename: file.filename,
          error: err.message,
        });
        // Still add delay even on error to prevent overwhelming server
        if (i < pendingFiles.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_FILES),
          );
        }
      }
    }

    return NextResponse.json(
      {
        message: `Triggered ${results.length} background jobs`,
        results,
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[TRIGGER] Error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}

export async function GET(req: Request) {
  return processPendingFiles(req);
}

export async function POST(req: Request) {
  return processPendingFiles(req);
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
