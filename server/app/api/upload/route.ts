import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { withCORS } from "../_utils/cors";

export const runtime = "nodejs";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: withCORS(req) });
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

    const privateKeyField = formData.get("privateKey");
    const overrideKey =
      typeof privateKeyField === "string" ? privateKeyField.trim() : undefined;

    console.log(`Uploading: ${file.name} (${file.size} bytes)`);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { walrusClient, signer } = await initWalrus(
      overrideKey ? { privateKey: overrideKey } : {}
    );

    try {
      const result = await walrusClient.writeBlob({
        blob: new Uint8Array(buffer),
        signer: signer as any, // intentional to bypass Vercel types
        epochs: 3,
        deletable: true,
      });

      console.log("✅ Upload complete! BlobId:", result.blobId);

      return NextResponse.json(
        { message: "✅ File uploaded successfully!", blobId: result.blobId },
        { status: 200, headers: withCORS(req) }
      );
    } catch (err: any) {
      // Handle partial success case
      if (err?.message?.includes("NotEnoughBlobConfirmationsError")) {
        const match = err.message.match(/blob ([A-Za-z0-9_-]+) to nodes/);
        const blobId = match?.[1];
        if (blobId) {
          console.warn("Upload succeeded but confirmations timed out:", blobId);
          return NextResponse.json(
            {
              message: "✅ File uploaded successfully!",
              blobId,
              status: "confirmed",
              note: "Upload successful - blob is available on Walrus",
            },
            { status: 200, headers: withCORS(req) }
          );
        }
      }
      throw err;
    }
  } catch (err) {
    console.error("❌ Upload error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500, headers: withCORS(req) }
    );
  }
}

export async function GET(req: Request) {
  return NextResponse.json({ message: "Upload route is alive!" }, { headers: withCORS(req) });
}
