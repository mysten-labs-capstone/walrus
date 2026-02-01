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
        { status: 400, headers: withCORS(req) },
      );
    }

    // Single optimized query: get saved shares with their related share and file data
    const savedShares = await (prisma.savedShare as any).findMany({
      where: { userId: userId },
      include: {
        share: {
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
        },
      },
      orderBy: { savedAt: "desc" },
    });

    if (savedShares.length === 0) {
      return NextResponse.json(
        { savedShares: [] },
        { status: 200, headers: withCORS(req) },
      );
    }

    // Format response directly from the enriched query result
    const enriched = savedShares.map((saved: any) => ({
      ...saved,
      shareId: saved.shareId,
      expiresAt: saved.share?.expiresAt ?? null,
      createdAt: saved.share?.createdAt ?? null,
      encrypted: saved.share?.file?.encrypted ?? false,
      wrappedFileKey: saved.share?.file?.wrappedFileKey ?? null,
      uploadedAt: saved.share?.file?.uploadedAt ?? saved.savedAt,
      epochs: saved.share?.file?.epochs ?? null,
      contentType: saved.contentType ?? saved.share?.file?.contentType ?? null,
      originalSize:
        saved.originalSize ?? saved.share?.file?.originalSize ?? null,
      filename: saved.filename ?? saved.share?.file?.filename ?? null,
      blobId: saved.blobId ?? saved.share?.file?.blobId ?? null,
    }));

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
      { status: 200, headers: withCORS(req) },
    );
  } catch (err: any) {
    console.error("[shares/saved] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve saved files" },
      { status: 500, headers: withCORS(req) },
    );
  }
}
