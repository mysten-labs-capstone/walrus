import { NextResponse } from "next/server";
import { s3Service } from "@/utils/s3Service";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cleanup endpoint to delete S3 files that are older than 24 hours
 * after Walrus upload completed.
 * 
 * Call this via cron job or scheduled task:
 * - Vercel Cron: Add to vercel.json
 * - GitHub Actions: Schedule workflow
 * - Manual: curl POST to this endpoint
 */
export async function POST(req: Request) {
  try {
    console.log('[S3 CLEANUP] Starting cleanup of old S3 files...');
    
    // Find files that:
    // 1. Have s3Key (uploaded via async mode)
    // 2. Status is 'completed' (Walrus upload done)
    // 3. lastAccessedAt is > 24 hours ago (safe to delete from S3)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const filesToCleanup = await prisma.file.findMany({
      where: {
        s3Key: { not: null },
        status: 'completed',
        lastAccessedAt: { lt: twentyFourHoursAgo },
      },
      select: {
        id: true,
        s3Key: true,
        filename: true,
        blobId: true,
        lastAccessedAt: true,
      },
    });
    
    console.log(`[S3 CLEANUP] Found ${filesToCleanup.length} files to clean up`);
    
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const file of filesToCleanup) {
      if (!file.s3Key) continue;
      
      try {
        // Delete from S3
        await s3Service.delete(file.s3Key);
        console.log(`[S3 CLEANUP] Deleted: ${file.s3Key} (${file.filename})`);
        
        // Update database to clear s3Key
        await prisma.file.update({
          where: { id: file.id },
          data: { s3Key: null },
        });
        
        deletedCount++;
      } catch (err: any) {
        console.error(`[S3 CLEANUP] Failed to delete ${file.s3Key}:`, err.message);
        errorCount++;
      }
    }
    
    const summary = {
      message: 'S3 cleanup completed',
      found: filesToCleanup.length,
      deleted: deletedCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    };
    
    console.log('[S3 CLEANUP]', summary);
    
    return NextResponse.json(summary, { status: 200, headers: withCORS(req) });
  } catch (err: any) {
    console.error('[S3 CLEANUP] Error:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function GET(req: Request) {
  // Allow GET for easy cron job triggering
  return POST(req);
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}
