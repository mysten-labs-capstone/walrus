import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";

// Used Emojis: 💬 ❗

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

// Helper function to download with retries
async function downloadWithRetry(
  walrusClient: any,
  blobId: string,
  maxRetries: number = 5,
  delayMs: number = 2000
): Promise<Uint8Array> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`💬 Download attempt ${attempt}/${maxRetries} for ${blobId}`);
      const bytes = await walrusClient.readBlob({ blobId });
      
      if (bytes && bytes.length > 0) {
        console.log(`💬 Download successful on attempt ${attempt}`);
        return bytes;
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`❗ Attempt ${attempt} failed: ${err.message}`);
      
      // If it's a "not enough slivers" error and we have retries left, wait and try again
      if (attempt < maxRetries && err.message?.includes("slivers")) {
        console.log(`❗ Waiting ${delayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        // Increase delay exponentially
        delayMs = Math.min(delayMs * 1.5, 10000);
      } else {
        throw err;
      }
    }
  }

  throw lastError || new Error("ERROR: Download failed after all retries");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { blobId, filename } = body ?? {};

    if (!blobId) {
      return NextResponse.json(
        { error: "Missing blobId" },
        { status: 400, headers: withCORS(req) }
      );
    }

    const downloadName = filename?.trim() || `${blobId}`;

    const { walrusClient } = await initWalrus();

    console.log(`💬 Fetching blob ${blobId} from Walrus...`);
    
    // Use retry mechanism
    const bytes = await downloadWithRetry(walrusClient, blobId, 5, 2000);

    if (!bytes || bytes.length === 0) {
      return NextResponse.json(
        { error: "Blob had no data" },
        { status: 404, headers: withCORS(req) }
      );
    }

    console.log(
      `💬 Download ready: ${downloadName} (${bytes.length} bytes, BlobId: ${blobId})`
    );

    const headers = withCORS(req, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "no-store",
    });

    return new Response(Buffer.from(bytes), { status: 200, headers });
  } catch (err: any) {
    console.error("❗ Download error:", err);
    
    // Provide more helpful error messages
    let errorMessage = err.message;
    if (err.message?.includes("slivers")) {
      errorMessage = "File is still being replicated across storage nodes. Please wait 30-60 seconds and try again.";
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: withCORS(req) }
    );
  }
}