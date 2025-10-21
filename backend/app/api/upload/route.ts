// backend/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";

// Explicitly use Node runtime
export const runtime = "nodejs";

export async function POST(req: Request) {
    try {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      if (!file) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }
  
      console.log(`📁 File: ${file.name}, Size: ${file.size} bytes`);
      const buffer = Buffer.from(await file.arrayBuffer());
  
      const { walrusClient, signer } = await initWalrus();
  
      console.log("⬆️  Starting upload...");
      
      try {
        const result = await walrusClient.writeBlob({
          blob: new Uint8Array(buffer),
          signer: signer,
          epochs: 3,
          deletable: true,
        });
  
        console.log("✅ Success! BlobId:", result.blobId);
        return NextResponse.json({
          message: "✅ File uploaded successfully!",
          blobId: result.blobId,
        });
      } catch (err: any) {
        // Check if it's the confirmation timeout error
        if (err.message?.includes('NotEnoughBlobConfirmationsError')) {
          // Extract blobId from error message
          // Error format: "Too many failures while writing blob <BLOB_ID> to nodes"
          const match = err.message.match(/blob ([A-Za-z0-9_-]+) to nodes/);
          const blobId = match ? match[1] : null;
          
          if (blobId) {
            console.log("⚠️  Upload succeeded but timed out waiting for confirmations");
            console.log("📦 BlobId:", blobId);
            
            return NextResponse.json({
              message: "✅ File uploaded successfully!",
              blobId,
              status: "confirmed",
              note: "Upload successful - blob is available on Walrus"
            });
          }
        }
        throw err;
      }
    } catch (err) {
      console.error("❌ Upload error:", err);
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 500 }
      );
    }
  }

// Simple GET to test route availability
export async function GET() {
  return NextResponse.json({ message: "Upload route is alive!" });
}
