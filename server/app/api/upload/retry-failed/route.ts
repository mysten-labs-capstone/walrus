import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Retry failed Walrus uploads
 * Can be triggered manually or by a scheduled job
 */
export async function POST(req: Request) {
  try {
    // Check if any file is already being processed — only allow 1 Walrus upload at a time
    const processingCount = await prisma.file.count({
      where: { status: "processing" },
    });

    if (processingCount > 0) {
      return NextResponse.json(
        {
          message: `Skipping retry — ${processingCount} file(s) already processing on Walrus`,
          skipped: true,
        },
        { status: 200, headers: withCORS(req) },
      );
    }

    const body = await req.json().catch(() => ({}));
    const { fileId } = body;
    const query = {
      s3Key: { not: null },
      status: "failed",
      ...(fileId ? { id: fileId } : {}),
    };

    // Only retry 1 file at a time to prevent server overload
    const failedFiles = await prisma.file.findMany({
      where: query,
      select: {
        id: true,
        s3Key: true,
        blobId: true,
        filename: true,
        userId: true,
        epochs: true,
      },
      orderBy: { uploadedAt: "asc" }, // FIFO: oldest first
      take: 1,
    });
    const results = [];

    for (const file of failedFiles) {
      if (!file.s3Key) continue;

      const baseUrl =
        process.env.NEXT_PUBLIC_API_BASE || process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";

      try {
        const response = await fetch(`${baseUrl}/api/upload/process-async`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: file.id,
            s3Key: file.s3Key,
            tempBlobId: file.blobId,
            userId: file.userId,
            epochs: file.epochs,
          }),
        });

        const result = await response.json();

        results.push({
          fileId: file.id,
          filename: file.filename,
          success: response.ok,
          status: result.status,
          error: result.error,
        });
      } catch (err: any) {
        console.error(
          `[RETRY] Error triggering retry for ${file.filename}:`,
          err.message,
        );
        results.push({
          fileId: file.id,
          filename: file.filename,
          success: false,
          error: err.message,
        });
      }
    }

    return NextResponse.json(
      {
        message: "Retry job completed",
        attempted: failedFiles.length,
        results,
      },
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[RETRY] Error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}

export async function GET(req: Request) {
  return POST(req);
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
