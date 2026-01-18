import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { s3Service } from "@/utils/s3Service";
import { cacheService } from "@/utils/cacheService";
import { encryptionService } from "@/utils/encryptionService";
import prisma from "../_utils/prisma";
import { withCORS } from "../_utils/cors";
import crypto from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const userId = form.get("userId") as string | null;
    const userPrivateKey = form.get("userPrivateKey") as string | null;
    const encryptOnServer = form.get("encryptOnServer") === "true";
    const clientSideEncrypted = form.get("clientSideEncrypted") === "true";
    const paymentAmount = form.get("paymentAmount") as string | null;
    const epochs = form.get("epochs") ? parseInt(form.get("epochs") as string) : 3;
    const uploadMode = (form.get("uploadMode") as string) || "async";

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400, headers: withCORS(req) }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID required" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Get username for NEW S3 key generation
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, balance: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404, headers: withCORS(req) }
      );
    }

    const username = user.username;
    console.log(`[UPLOAD] User: ${username}, File: ${file.name}, Mode: ${uploadMode}, Epochs: ${epochs}`);

    // Calculate cost if not provided
    let costUSD = paymentAmount ? parseFloat(paymentAmount) : 0;
    
    if (costUSD === 0) {
      console.log('[UPLOAD] No payment amount provided, calculating from file size...');
      const sizeInGB = file.size / (1024 * 1024 * 1024);
      const costSUI = Math.max(sizeInGB * 0.001 * epochs, 0.0000001); // min 0.0000001 SUI
      // Fetch SUI price
      const { getSuiPriceUSD } = await import("@/utils/priceConverter");
      const suiPrice = await getSuiPriceUSD();
      costUSD = Math.max(costSUI * suiPrice, 0.01); // min $0.01
      console.log(`[UPLOAD] Calculated cost: ${costUSD} USD (${costSUI} SUI @ ${suiPrice} USD/SUI)`);
    }
    
    console.log(`[UPLOAD] Payment info - paymentAmount from client: ${paymentAmount}, final costUSD: $${costUSD.toFixed(4)}`);

    // Check balance before proceeding
    if (user.balance < costUSD) {
      return NextResponse.json(
        { error: "Insufficient balance" },
        { status: 400, headers: withCORS(req) }
      );
    }

    // Helper function to encrypt userId (since cacheService.encryptUserId is private)
    const encryptUserId = async (userId: string): Promise<string> => {
      const masterKey = process.env.MASTER_ENCRYPTION_KEY;
      if (!masterKey) {
        throw new Error('MASTER_ENCRYPTION_KEY not configured');
      }
      
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        Buffer.from(masterKey, 'hex'),
        iv
      );
      
      let encrypted = cipher.update(userId, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag().toString('hex');
      const ivHex = iv.toString('hex');
      
      return `${encrypted}:${authTag}:${ivHex}`;
    };

    let buffer = Buffer.from(await file.arrayBuffer());
    let encrypted = clientSideEncrypted;
    let userKeyEncrypted = false;
    let masterKeyEncrypted = false;

    // Handle server-side encryption if requested
    if (encryptOnServer && !clientSideEncrypted && userPrivateKey) {
      try {
        console.log(`[UPLOAD] Encrypting on server...`);
        const encryptionResult = await encryptionService.doubleEncrypt(buffer, userPrivateKey);
        
        // Create metadata header + encrypted data
        const metadataHeader = encryptionService.createMetadataHeader({
          userSalt: encryptionResult.userSalt,
          userIv: encryptionResult.userIv,
          userAuthTag: encryptionResult.userAuthTag,
          masterIv: encryptionResult.masterIv,
          masterAuthTag: encryptionResult.masterAuthTag,
          originalFilename: file.name,
        });
        
        // Combine metadata header + encrypted data
        buffer = Buffer.concat([metadataHeader, encryptionResult.encrypted]);
        
        encrypted = true;
        userKeyEncrypted = true;
        masterKeyEncrypted = true;
        console.log(`[UPLOAD] Server-side encryption complete`);
      } catch (encryptErr) {
        console.error(`[UPLOAD] Encryption failed:`, encryptErr);
        return NextResponse.json(
          { error: "Encryption failed" },
          { status: 500, headers: withCORS(req) }
        );
      }
    } else if (clientSideEncrypted) {
      userKeyEncrypted = true;
      console.log(`[UPLOAD] Using client-side encrypted file`);
    }

    // ASYNC MODE: Upload to S3 first, then Walrus in background
    if (uploadMode === "async") {
      console.log(`[UPLOAD] Using ASYNC mode - S3 first, Walrus in background`);

      // Deduct payment BEFORE upload (optimistic - we'll refund if upload fails)
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: costUSD } },
        });
        console.log(`[UPLOAD] Deducted $${costUSD.toFixed(4)} from user ${userId} balance`);
      } catch (paymentErr: any) {
        console.error('[UPLOAD] Payment deduction failed:', paymentErr);
        return NextResponse.json(
          { error: `Payment failed: ${paymentErr.message}` },
          { status: 400, headers: withCORS(req) }
        );
      }

      // Generate temp blob ID for immediate use
      const tempBlobId = crypto.randomBytes(16).toString('hex');
      
      // Generate S3 key using NEW structure: username/blobId/filename
      const s3Key = s3Service.generateKey(username, tempBlobId, file.name);

      // Upload to S3 immediately
      try {
        await s3Service.upload(s3Key, buffer, {
          contentType: file.type || 'application/octet-stream',
          originalFilename: file.name,
          userId: userId,
          encrypted: String(encrypted),
        });
        console.log(`[UPLOAD] ✅ S3 upload complete: ${s3Key}`);
      } catch (s3Err: any) {
        // TODO: temporary verbose logging for S3 upload failures - remove after debugging
        console.error(`[UPLOAD] S3 upload failed:`, s3Err);
        console.error(`[UPLOAD] S3 upload details - name: ${s3Err?.name}, message: ${s3Err?.message}`);
        if (s3Err?.$metadata) console.error('[UPLOAD] S3 $metadata:', s3Err.$metadata);
        if (s3Err?.stack) console.error(s3Err.stack);

        // Refund payment on S3 failure
        try {
          await prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: costUSD } },
          });
          console.log(`[UPLOAD] Refunded $${costUSD.toFixed(4)} due to S3 failure`);
        } catch (refundErr) {
          console.error(`[UPLOAD] CRITICAL: Failed to refund payment after S3 failure:`, refundErr);
        }
        
        // TODO: temporarily return S3 error details to client for debugging - remove once fixed
        return NextResponse.json(
          { error: "S3 upload failed", detail: s3Err?.message || String(s3Err) },
          { status: 500, headers: withCORS(req) }
        );
      }

      // Encrypt userId for master wallet lookups
      const encryptedUserId = await encryptUserId(userId);

      // Create database record with 'pending' status
      const fileRecord = await prisma.file.create({
        data: {
          blobId: tempBlobId,
          userId,
          encryptedUserId,
          filename: file.name,
          originalSize: file.size,
          contentType: file.type || 'application/octet-stream',
          encrypted,
          userKeyEncrypted,
          masterKeyEncrypted,
          epochs,
          status: 'pending',
          s3Key,
          uploadedAt: new Date(),
          lastAccessedAt: new Date(),
        },
      });

      console.log(`[UPLOAD] Database record created: ${fileRecord.id}, status: pending`);

      // Trigger background job asynchronously
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'https://walrus-jpfl.onrender.com';
      fetch(`${apiBase}/api/upload/process-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: fileRecord.id,
          s3Key,
          tempBlobId,
          userId,
          epochs,
        }),
      }).catch(e => console.error('[UPLOAD] Background job trigger failed:', e));

      // Return immediately with temp blob ID
      return NextResponse.json(
        {
          blobId: tempBlobId,
          fileId: fileRecord.id,
          s3Key,
          status: 'pending',
          uploadMode: 'async',
          message: 'File uploaded to S3, Walrus upload in progress',
          costUSD: parseFloat(costUSD.toFixed(4)),
        },
        { status: 200, headers: withCORS(req) }
      );
    }

    // SYNC MODE: Traditional upload directly to Walrus
    console.log(`[UPLOAD] Using SYNC mode - direct Walrus upload`);

    try {
      const { walrusClient, signer } = await initWalrus();

      const result = await walrusClient.writeBlob({
        blob: new Uint8Array(buffer),
        signer,
        epochs,
        deletable: true,
      });

      const blobId = result.blobId;
      const blobObjectId = result.blobObject?.id?.id || null;

      console.log(`[UPLOAD] Walrus upload complete: ${blobId}`);

      // Deduct payment after successful upload
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { balance: { decrement: costUSD } },
        });
        console.log(`[UPLOAD] Deducted $${costUSD.toFixed(4)} from user ${userId} balance`);
      } catch (paymentErr: any) {
        console.error('[UPLOAD] Payment deduction failed:', paymentErr);
        return NextResponse.json(
          { error: `Upload succeeded but payment failed: ${paymentErr.message}` },
          { status: 500, headers: withCORS(req) }
        );
      }

      // Generate S3 key using NEW structure (even for sync uploads)
      const s3Key = s3Service.generateKey(username, blobId, file.name);

      // Encrypt userId for master wallet lookups
      const encryptedUserId = await encryptUserId(userId);

      // Create database record with 'completed' status
      const fileRecord = await prisma.file.create({
        data: {
          blobId,
          blobObjectId,
          userId,
          encryptedUserId,
          filename: file.name,
          originalSize: file.size,
          contentType: file.type || 'application/octet-stream',
          encrypted,
          userKeyEncrypted,
          masterKeyEncrypted,
          epochs,
          status: 'completed',
          s3Key: null,
          uploadedAt: new Date(),
          lastAccessedAt: new Date(),
        },
      });

      // Cache the file
      await cacheService.init();
      await cacheService.set(blobId, userId, buffer, {
        filename: file.name,
        originalSize: file.size,
        contentType: file.type || 'application/octet-stream',
        encrypted,
        userKeyEncrypted,
        masterKeyEncrypted,
        blobObjectId,
        epochs,
      });

      return NextResponse.json(
        {
          blobId,
          status: 'completed',
          uploadMode: 'sync',
          costUSD: parseFloat(costUSD.toFixed(4)),
        },
        { status: 200, headers: withCORS(req) }
      );
    } catch (walrusErr: any) {
      console.error(`[UPLOAD] Walrus upload failed:`, walrusErr);
      return NextResponse.json(
        { error: walrusErr.message || "Walrus upload failed" },
        { status: 500, headers: withCORS(req) }
      );
    }
  } catch (err: any) {
    console.error("[UPLOAD] Error:", err);
    return NextResponse.json(
      { error: err.message || "Upload failed" },
      { status: 500, headers: withCORS(req) }
    );
  }
}