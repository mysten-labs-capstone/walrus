import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";
import { purgeExpiredFilesForUser } from "../../_utils/expiredFiles";

export const runtime = "nodejs";

/**
 * Get completed encrypted files for blockchain sync
 * Returns files that have been uploaded to Walrus (status='completed')
 * and are encrypted (encrypted=true)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "Missing userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    await purgeExpiredFilesForUser(userId);

    // Get all completed encrypted files for this user
    const files = await prisma.file.findMany({
      where: {
        userId,
        encrypted: true,
        status: "completed", // Only files that made it to Walrus
      },
      select: {
        id: true,
        fileId: true, // Blockchain file identifier
        blobId: true, // Walrus blob ID
        filename: true,
        epochs: true,
        uploadedAt: true,
      },
      orderBy: {
        uploadedAt: "desc",
      },
    });

    return NextResponse.json(
      { files },
      { status: 200, headers: withCORS(req) }
    );
  } catch (error: any) {
    console.error("[GET /api/files/completed] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
