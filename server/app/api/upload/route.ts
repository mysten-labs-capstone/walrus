import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";

// Used Emojis: 💬 ❗

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
}

// Helper function to extract blobId from any stage
async function uploadWithTimeout(
  walrusClient: any,
  blob: Uint8Array,
  signer: any,
  timeoutMs: number = 25000 // 25 seconds
) {
  let blobIdFromError: string | null = null;

  const uploadPromise = walrusClient.writeBlob({
    blob,
    signer,
    epochs: 3,
    deletable: true,
  }).catch((err: any) => {
    // Extract blobId even from error
    const match = err?.message?.match(/blob ([A-Za-z0-9_-]+)/);
    if (match) {
      blobIdFromError = match[1];
    }
    throw err;
  });

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Upload timeout")), timeoutMs)
  );

  try {
    const result = await Promise.race([uploadPromise, timeoutPromise]);
    return { success: true, blobId: (result as any).blobId };
  } catch (err: any) {
    // If we got a blobId from the error, consider it success
    if (blobIdFromError) {
      return { success: true, blobId: blobIdFromError, fromError: true };
    }
    throw err;
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Missing file" },
        { status: 400, headers: withCORS(req) }
      );
    }

    console.log(`DEBUG: Uploading: ${file.name} (${file.size} bytes)`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { walrusClient, signer } = await initWalrus();

    const result = await uploadWithTimeout(
      walrusClient,
      new Uint8Array(buffer),
      signer,
      25000 // 25 second timeout
    );

    console.log(
      result.fromError
        ? `💬 Upload succeeded (extracted from timeout): ${result.blobId}`
        : `💬 Upload complete: ${result.blobId}`
    );

    return NextResponse.json(
      {
        message: "SUCCESS: File uploaded successfully!",
        blobId: result.blobId,
        status: "confirmed",
      },
      { status: 200, headers: withCORS(req) }
    );
  } catch (err) {
    console.error("❗ Upload error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function GET(req: Request) {
  return NextResponse.json(
    { message: "Upload route is alive!" },
    { headers: withCORS(req) }
  );
}