import fs from "fs/promises";
import path from "path";
import { initWalrus } from "./utils/walrusClient.js";

interface BlobMetadata {
  blobId: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

const METADATA_FILE = "blob-metadata.json";

async function getMetadata(blobId: string): Promise<BlobMetadata | null> {
  try {
    const data = await fs.readFile(METADATA_FILE, "utf-8");
    const metadataList: BlobMetadata[] = JSON.parse(data);
    return metadataList.find((m) => m.blobId === blobId) || null;
  } catch {
    return null;
  }
}

export async function downloadBlob(
  blobId: string,
  outputDir: string = ".",
  outputName?: string
): Promise<string> {
  const { walrusClient } = await initWalrus();

  console.log(`Downloading blob ${blobId}...`);

  // Read raw blob
  const blob = await walrusClient.readBlob({ blobId });

  console.log(`Downloaded blob size: ${blob.length} bytes`);

  const metadata = await getMetadata(blobId);
  if (metadata) {
    console.log(`Original filename: ${metadata.originalName}`);
    console.log(`Content type: ${metadata.contentType}`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  // Use provided name, or metadata name, or blob ID
  const fileName = outputName || metadata?.originalName || `${blobId}.bin`;
  const outPath = path.resolve(outputDir, fileName);

  console.log(`Saving to: ${outPath}`);

  await fs.writeFile(outPath, blob);

  console.log(`✅ Saved blob to ${outPath}`);
  console.log(`Size: ${blob.length} bytes`);

  return outPath;
}