import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  console.log('[shares/save] POST request received');
  console.log('[shares/save] Request origin:', req.headers.get('origin'));
  console.log('[shares/save] Request method:', req.method);
  
  try {
    const body = await req.json();
    console.log('[shares/save] Request body:', { 
      shareId: body.shareId, 
      blobId: body.blobId, 
      filename: body.filename, 
      userId: body.userId 
    });

    const { shareId, blobId, filename, originalSize, contentType, uploadedBy, userId } = body;

    // Validate required fields
    if (!shareId || !blobId || !filename || !userId) {
      console.error('[shares/save] Missing required fields:', { shareId, blobId, filename, userId });
      return NextResponse.json(
        { error: "Missing required fields: shareId, blobId, filename, userId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      console.error('[shares/save] User not found:', userId);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    console.log('[shares/save] User found:', user.username);

    // Get uploader's username
    const uploader = uploadedBy ? await prisma.user.findUnique({
      where: { id: uploadedBy },
      select: { username: true },
    }) : null;

    console.log('[shares/save] Creating SavedShare record:', { shareId, blobId, filename, userId });

    // Create SavedShare record
    const savedShare = await prisma.savedShare.create({
      data: {
        shareId,
        blobId,
        filename,
        originalSize: originalSize || 0,
        contentType: contentType || null,
        uploadedBy: uploadedBy || "unknown",
        uploadedByUsername: uploader?.username || null,
        savedBy: userId,
      },
    });

    console.log('[shares/save] SavedShare created successfully:', savedShare.id);

    return NextResponse.json(
      {
        message: "File saved successfully",
        savedShare,
      },
      { status: 201, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[shares/save] Error:", err.message || err);
    console.error("[shares/save] Error stack:", err.stack);
    return NextResponse.json(
      { error: err.message || "Failed to save file" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
