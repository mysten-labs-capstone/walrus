import { NextResponse } from "next/server";
import { withCORS } from "../_utils/cors";
import prisma from "../_utils/prisma";
import { purgeExpiredFilesForUser } from "../_utils/expiredFiles";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * FAST READ-ONLY: /api/cache endpoint
 *
 * Returns precomputed file data from DB. NO corrections, NO background jobs.
 * - Returns files as-is from DB
 * - Returns user-scoped stats only
 * - Never triggers updates or background jobs
 * - Client computes folder paths using its cached folder tree
 *
 * All corrections/updates happen via separate cron endpoint.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");
    const starred = searchParams.get("starred");

    if (action === "stats") {
      // Return user-scoped stats only (no global total - too expensive)
      if (!userId) {
        return NextResponse.json(
          { error: "userId required for stats" },
          { status: 400, headers: withCORS(req) },
        );
      }
      await purgeExpiredFilesForUser(userId);
      const userTotal = await prisma.file.count({ where: { userId } });
      return NextResponse.json(
        { userTotal, cached: true },
        { headers: withCORS(req) },
      );
    }

    if (userId) {
      await purgeExpiredFilesForUser(userId);

      // Fast read: return files as-is, no derived data
      const files = await prisma.file.findMany({
        where: {
          userId,
          ...(starred === "true" && { starred: true }),
        },
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          blobId: true,
          filename: true,
          originalSize: true,
          contentType: true,
          encrypted: true,
          epochs: true,
          uploadedAt: true,
          lastAccessedAt: true,
          status: true,
          s3Key: true,
          folderId: true,
          starred: true,
        },
      });

      return NextResponse.json(
        { files, count: files.length, cached: true },
        { headers: withCORS(req) },
      );
    }

    return NextResponse.json(
      { error: "Missing userId or action parameter" },
      { status: 400, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("Cache GET error (DB-backed):", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}

/**
 * Minimal POST handler for legacy client compatibility only.
 * Returns success for all actions (actual work happens elsewhere).
 * - action: 'check' => returns { cached: false, isReadOnly: true }
 * - action: 'delete' => use /api/delete instead
 * - action: 'cleanup' => use cron instead
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body || {};

    switch (action) {
      case "check":
        return NextResponse.json(
          { cached: false, isReadOnly: true },
          { headers: withCORS(req) },
        );
      case "delete":
        return NextResponse.json(
          { message: "Use /api/delete instead" },
          { headers: withCORS(req) },
        );
      case "cleanup":
        return NextResponse.json(
          { message: "Cleanup via cron, not direct requests" },
          { headers: withCORS(req) },
        );
      default:
        return NextResponse.json(
          { error: "Invalid action" },
          { status: 400, headers: withCORS(req) },
        );
    }
  } catch (err: any) {
    console.error("Cache POST error (DB-backed):", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) },
    );
  }
}
