import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import prisma from "../../_utils/prisma";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

/**
 * POST /api/shares/save
 * Save a shared file to the user's library
 * 
 * Body: {
 *   shareId: string,
 *   blobId: string,
 *   filename: string,
 *   originalSize: number,
 *   contentType?: string,
 *   uploadedBy: string,
 *   uploadedByUsername: string,
 *   userId: string (recipient)
 * }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { shareId, blobId, filename, originalSize, contentType, uploadedBy, uploadedByUsername, userId } = body;

    if (!shareId || !blobId || !filename || !userId || !uploadedBy || !uploadedByUsername) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if user has already saved this share
    const existing = await prisma.savedShare.findUnique({
      where: {
        userId_shareId: {
          userId,
          shareId,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You have already saved this file", saved: true },
        { status: 409, headers: withCORS(req) }
      );
    }

    // Create saved share record
    const savedShare = await prisma.savedShare.create({
      data: {
        userId,
        shareId,
        blobId,
        filename,
        originalSize,
        contentType: contentType || null,
        uploadedBy,
        uploadedByUsername,
      },
    });

    console.log(`[SAVE SHARE] User ${userId} saved share ${shareId}`);

    return NextResponse.json(
      {
        id: savedShare.id,
        saved: true,
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[POST /api/shares/save] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save share" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
