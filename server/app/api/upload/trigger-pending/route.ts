import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

/**
 * Trigger background jobs for all pending files
 * This is a manual endpoint to fix stuck files
 */
export async function POST(req: Request) {
  try {
    const pendingFiles = await prisma.file.findMany({
      where: { status: 'pending' },
      orderBy: { uploadedAt: 'desc' },
      take: 10,
    });

    console.log(`[TRIGGER] Found ${pendingFiles.length} pending files`);

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE || 'https://walrus-three.vercel.app';
    const results = [];

    for (const file of pendingFiles) {
      try {
        const response = await fetch(`${baseUrl}/api/upload/process-async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
      } catch (err: any) {
        results.push({
          fileId: file.id,
          filename: file.filename,
          error: err.message,
        });
      }
    }

    return NextResponse.json(
      { 
        message: `Triggered ${results.length} background jobs`,
        results,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[TRIGGER] Error:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}
