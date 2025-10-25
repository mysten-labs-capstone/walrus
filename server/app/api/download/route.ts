import { NextResponse } from "next/server";
import { initWalrus } from "@/utils/walrusClient";

// Explicitly use Node runtime
export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const blobId = searchParams.get("blobId");
    if (!blobId) {
      return NextResponse.json({ error: "Missing blobId" }, { status: 400 });
    }

    const downloadName = searchParams.get("filename") ?? `${blobId}`;

    const { walrusClient } = await initWalrus();

    console.log(`⬇️  Fetching blob ${blobId} from Walrus...`);
    const bytes = await walrusClient.readBlob({ blobId });

    if (!bytes || bytes.length === 0) {
      return NextResponse.json({ error: "Blob had no data" }, { status: 404 });
    }

  console.log(`✅ Download ready: ${downloadName} (BlobId: ${blobId}, Size: ${bytes.length} bytes)`);

  const headers = new Headers({
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes.length.toString(),
      "Content-Disposition": `attachment; filename="${downloadName}"`,
      "Cache-Control": "no-store",
    });

    return new Response(Buffer.from(bytes), { status: 200, headers });
  } catch (err) {
    console.error("❌ Download error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
