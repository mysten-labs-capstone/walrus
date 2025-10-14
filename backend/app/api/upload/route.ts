import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";

export async function GET() {
  console.log("✅ upload GET hit");
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  console.log("✅ upload POST hit");
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  //print name of file for debugging
  console.log("File name:", file.name);

  const buffer = Buffer.from(await file.arrayBuffer());
  // const {walrusClient, signer} = await initWalrus(); // error in here somwhere
  return NextResponse.json({ ok: true });
}




/*
// backend/app/api/upload/route.ts
import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";

// Explicitly use Node runtime
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Parse uploaded file from form data
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    // Convert file to buffer (keep in memory, no fs / temp file)
    const buffer = Buffer.from(await file.arrayBuffer());

    // Initialize Walrus client + signer
    const { walrusClient, signer } = await initWalrus();

    // Upload blob directly to Walrus
    const blobId = await walrusClient.writeBlob({
      blob: buffer,
      signer,
      epochs: 10,
      deletable: true,
    });

    // Respond with success
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

// Simple GET to test route availability
export async function GET() {
  return NextResponse.json({ message: "Upload route is alive!" });
}
*/