import { NextResponse } from "next/server";
import prisma from "../_utils/prisma";
import { withCORS } from "../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const { shareId, blobId, filename, originalSize, contentType, uploadedBy, userId } = await req.json();

    // Validate required fields
    if (!shareId || !blobId || !filename || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Get uploader's username
    const uploader = uploadedBy ? await prisma.user.findUnique({
      where: { id: uploadedBy },
      select: { username: true },
    }) : null;

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

    return NextResponse.json(
      {
        message: "File saved successfully",
        savedShare,
      },
      { status: 201, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[shares/save] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to save file" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
