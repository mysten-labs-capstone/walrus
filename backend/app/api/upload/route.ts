// backend/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs"; // required for file system access

export async function POST(req: Request) {
  try {
    // Get the uploaded file from the request body (multipart/form-data)
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Save to a temp path (so we can pass it to Walrus)
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempPath = path.join(os.tmpdir(), file.name);
    await fs.writeFile(tempPath, buffer);

    // Initialize Walrus client + signer
    const { walrusClient, signer } = await initWalrus();

    // Upload to Walrus
    const blobId = await walrusClient.storeFile(tempPath, signer);

    // Delete the temp file after upload
    await fs.unlink(tempPath);

    return NextResponse.json({
      message: "✅ File uploaded successfully!",
      blobId,
    });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
