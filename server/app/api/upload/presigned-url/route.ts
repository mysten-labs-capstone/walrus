import { NextResponse } from "next/server";
import { withCORS } from "../../_utils/cors";
import { s3Service } from "@/utils/s3Service";
import prisma from "../../_utils/prisma";
import { cacheService } from "@/utils/cacheService";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      userId, 
      filename, 
      fileSize, 
      contentType,
      encrypted,
      epochs = 3,
      paymentAmount 
    } = body;

    if (!userId || !filename || !fileSize) {
      return NextResponse.json(
        { error: "Missing required fields: userId, filename, fileSize" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Validate file size
    const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
    if (fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Calculate cost if not provided
    let costUSD = paymentAmount ? parseFloat(paymentAmount) : 0;
    if (costUSD === 0) {
      const sizeInGB = fileSize / (1024 * 1024 * 1024);
      const costSUI = Math.max(sizeInGB * 0.001 * epochs, 0.0000001);
      const { getSuiPriceUSD } = await import("@/utils/priceConverter");
      const suiPrice = await getSuiPriceUSD();
      costUSD = Math.max(costSUI * suiPrice, 0.01);
    }

    // Check and deduct balance
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    if (user.balance < costUSD) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Deduct payment
    await prisma.user.update({
      where: { id: userId },
      data: { balance: { decrement: costUSD } },
    });

    console.log(`[PRESIGNED] Deducted $${costUSD.toFixed(4)} from user ${userId}`);

    // Generate temp blob ID and S3 key
    const tempBlobId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const s3Key = s3Service.generateKey(userId, tempBlobId, filename);

    // Generate presigned URL for upload (10 minute expiry)
    const presignedUrl = await s3Service.getPresignedUploadUrl(s3Key, {
      contentType: contentType || 'application/octet-stream',
      expiresIn: 600, // 10 minutes
      metadata: {
        userId,
        filename,
        encrypted: String(encrypted || false),
        epochs: String(epochs),
      },
    });

    // Create file record with pending status
    await cacheService.init();
    const encryptedUserId = await cacheService['encryptUserId'](userId);

    const fileRecord = await prisma.file.create({
      data: {
        blobId: tempBlobId,
        blobObjectId: null,
        userId,
        encryptedUserId,
        filename,
        originalSize: fileSize,
        contentType: contentType || 'application/octet-stream',
        encrypted: encrypted || false,
        userKeyEncrypted: encrypted || false,
        masterKeyEncrypted: false,
        epochs,
        cached: false,
        uploadedAt: new Date(),
        lastAccessedAt: new Date(),
        s3Key: s3Key,
        status: 'pending',
      }
    });

    console.log(`[PRESIGNED] Created file record ${fileRecord.id} with presigned URL`);

    return NextResponse.json(
      {
        presignedUrl,
        fileId: fileRecord.id,
        tempBlobId,
        s3Key,
        message: "Upload file to presigned URL, then it will be processed within 1 minute",
      },
      { status: 200, headers: withCORS(req) }
    );

  } catch (err: any) {
    console.error("[PRESIGNED] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate presigned URL" },
      { status: 500, headers: withCORS(req) }
    );
  }
}
