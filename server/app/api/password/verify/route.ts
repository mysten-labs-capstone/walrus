import { NextResponse } from "next/server";
import { verifyFilePassword, isFileProtected } from "@/utils/passwordStore";
import { withCORS } from "../../_utils/cors";
import { cacheService } from "@/utils/cacheService";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { blobId, password, userId } = body;

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Check if file is protected
    const isProtected = await isFileProtected(blobId);
    
    // Check ownership - owners don't need password
    let isOwner = false;
    if (userId) {
      try {
        await cacheService.init();
        const fileRecord = await cacheService.prisma.file.findUnique({
          where: { blobId },
          select: { userId: true }
        });
        
        if (fileRecord) {
          isOwner = fileRecord.userId === userId;
        }
      } catch (err) {
        console.warn(`Could not check file ownership:`, err);
      }
    }

    // If user is the owner, they don't need password
    if (isOwner) {
      return NextResponse.json(
        { isProtected, isOwner: true, isValid: true },
        { status: 200, headers: withCORS(req) }
      );
    }
    
    if (!isProtected) {
      return NextResponse.json(
        { isProtected: false, isOwner: false, isValid: true },
        { status: 200, headers: withCORS(req) }
      );
    }

    // If protected and not owner, verify password
    if (!password) {
      return NextResponse.json(
        { isProtected: true, isOwner: false, isValid: false, error: "Password required" },
        { status: 401, headers: withCORS(req) }
      );
    }

    const isValid = await verifyFilePassword(blobId, password);

    return NextResponse.json(
      { isProtected: true, isOwner: false, isValid },
      { status: isValid ? 200 : 401, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error("❗ Password verify error:", err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}
