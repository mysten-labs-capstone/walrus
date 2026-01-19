import { NextResponse } from "next/server";
import prisma from "../../_utils/prisma";
import { withCORS } from "../../_utils/cors";

export const runtime = "nodejs";

/**
 * Reset all stuck files to ensure they eventually get uploaded to Walrus
 * - Processing files stuck for 5+ minutes → pending
 * - Failed files stuck for 10+ minutes → pending
 * - Old pending files stuck for 30+ minutes → flagged for re-trigger
 * - Files in S3 with no/invalid status → pending
 * Called by GitHub Actions cron every 10 minutes
 */
async function resetStuckFiles(req: Request) {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // 1. Find files stuck in processing for more than 5 minutes
    const stuckProcessingFiles = await prisma.file.findMany({
      where: {
        status: 'processing',
        uploadedAt: { lt: fiveMinutesAgo },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    // 2. Find files stuck in failed for more than 10 minutes
    const stuckFailedFiles = await prisma.file.findMany({
      where: {
        status: 'failed',
        uploadedAt: { lt: tenMinutesAgo },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    // 3. Find very old pending files (stuck for 30+ min, likely missed by cron)
    const oldPendingFiles = await prisma.file.findMany({
      where: {
        status: 'pending',
        uploadedAt: { lt: thirtyMinutesAgo },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    // 4. Find files in S3 but no valid status (edge case cleanup)
    const invalidStatusFiles = await prisma.file.findMany({
      where: {
        s3Key: { not: null },
        OR: [
          { status: { equals: null } },
          { status: { notIn: ['pending', 'processing', 'completed', 'failed'] } },
        ],
        uploadedAt: { lt: tenMinutesAgo },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    const totalStuckFiles = stuckProcessingFiles.length + stuckFailedFiles.length + oldPendingFiles.length + invalidStatusFiles.length;
    console.log(`[RESET-STUCK] Found ${stuckProcessingFiles.length} processing + ${stuckFailedFiles.length} failed + ${oldPendingFiles.length} old pending + ${invalidStatusFiles.length} invalid status = ${totalStuckFiles} total stuck files`);

    if (totalStuckFiles === 0) {
      return NextResponse.json(
        { 
          message: 'No stuck files found',
          count: 0,
        },
        { status: 200, headers: withCORS(req) }
      );
    }

    // Reset all stuck files to pending
    const [processingResult, failedResult, oldPendingResult, invalidStatusResult] = await Promise.all([
      // Reset processing files
      prisma.file.updateMany({
        where: {
          status: 'processing',
          uploadedAt: { lt: fiveMinutesAgo },
        },
        data: { status: 'pending' },
      }),
      // Reset failed files
      prisma.file.updateMany({
        where: {
          status: 'failed',
          uploadedAt: { lt: tenMinutesAgo },
        },
        data: { status: 'pending' },
      }),
      // Keep old pending files as pending (they'll be picked up by trigger-pending cron)
      Promise.resolve({ count: oldPendingFiles.length }),
      // Reset files with invalid status
      prisma.file.updateMany({
        where: {
          s3Key: { not: null },
          OR: [
            { status: { equals: null } },
            { status: { notIn: ['pending', 'processing', 'completed', 'failed'] } },
          ],
          uploadedAt: { lt: tenMinutesAgo },
        },
        data: { status: 'pending' },
      }),
    ]);

    const totalReset = processingResult.count + failedResult.count + invalidStatusResult.count;
    console.log(`[RESET-STUCK] Reset ${processingResult.count} processing + ${failedResult.count} failed + ${invalidStatusResult.count} invalid = ${totalReset} files to pending. ${oldPendingResult.count} old pending files will be retried by trigger-pending cron.`);

    return NextResponse.json(
      { 
        message: `Reset ${totalReset} stuck files to pending. ${oldPendingResult.count} old pending files awaiting retry.`,
        count: totalReset,
        totalAffected: totalStuckFiles,
        processing: {
          count: processingResult.count,
          files: stuckProcessingFiles.map(f => ({ id: f.id, filename: f.filename, uploadedAt: f.uploadedAt })),
        },
        failed: {
          count: failedResult.count,
          files: stuckFailedFiles.map(f => ({ id: f.id, filename: f.filename, uploadedAt: f.uploadedAt })),
        },
        oldPending: {
          count: oldPendingResult.count,
          files: oldPendingFiles.map(f => ({ id: f.id, filename: f.filename, uploadedAt: f.uploadedAt })),
        },
        invalidStatus: {
          count: invalidStatusResult.count,
          files: invalidStatusFiles.map(f => ({ id: f.id, filename: f.filename, uploadedAt: f.uploadedAt, status: f.status })),
        },
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err: any) {
    console.error('[RESET-STUCK] Error:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

// GET handler for Vercel Cron
export async function GET(req: Request) {
  return resetStuckFiles(req);
}

// POST handler for manual triggers
export async function POST(req: Request) {
  return resetStuckFiles(req);
}
