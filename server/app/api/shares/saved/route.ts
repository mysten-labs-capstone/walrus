import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    // Get all saved shares for this user
    const savedShares = await (prisma.savedShare as any).findMany({
      where: { userId: userId },
      orderBy: { savedAt: "desc" },
    });

    if (savedShares.length === 0) {
      return NextResponse.json(
        { savedShares: [] },
        { status: 200, headers: withCORS(req) }
      );
    }

    const shareIds = savedShares.map((s: any) => s.shareId);
    const shares = await prisma.share.findMany({
      where: { id: { in: shareIds } },
      include: {
        file: {
          select: {
            wrappedFileKey: true,
            encrypted: true,
            uploadedAt: true,
            epochs: true,
            contentType: true,
            originalSize: true,
            filename: true,
            blobId: true,
          },
        },
      },
    });

    const shareMap = new Map(shares.map((s) => [s.id, s]));
    const enriched = savedShares.map((saved: any) => {
      const share = shareMap.get(saved.shareId);
      return {
        ...saved,
        shareId: saved.shareId, // Include shareId for generating share links
        expiresAt: share?.expiresAt ?? null,
        createdAt: share?.createdAt ?? null,
        encrypted: share?.file?.encrypted ?? false,
        wrappedFileKey: share?.file?.wrappedFileKey ?? null,
        uploadedAt: share?.file?.uploadedAt ?? saved.savedAt,
        epochs: share?.file?.epochs ?? null,
        contentType: saved.contentType ?? share?.file?.contentType ?? null,
        originalSize: saved.originalSize ?? share?.file?.originalSize ?? null,
        filename: saved.filename ?? share?.file?.filename ?? null,
        blobId: saved.blobId ?? share?.file?.blobId ?? null,
      };
    });

    // Deduplicate by blobId - keep the most recently saved version
    const seenBlobIds = new Set<string>();
    const deduplicated = enriched.filter((item: any) => {
      if (!item.blobId || seenBlobIds.has(item.blobId)) {
        return false;
      }
      seenBlobIds.add(item.blobId);
      return true;
    });

    return NextResponse.json(
      { savedShares: deduplicated },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("[shares/saved] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve saved files" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
