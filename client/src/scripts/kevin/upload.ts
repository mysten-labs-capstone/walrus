import fs from "fs/promises";
import path from "path";
import { initWalrus } from "./utils/walrusClient.js";
import { validateFile, printValidationResult } from "./utils/fileValidator.js";

interface BlobMetadata {
  blobId: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

const METADATA_FILE = "blob-metadata.json";

async function saveMetadata(metadata: BlobMetadata): Promise<void> {
  let metadataList: BlobMetadata[] = [];

  try {
    const existing = await fs.readFile(METADATA_FILE, "utf-8");
    metadataList = JSON.parse(existing);
  } catch {
    // File doesn't exist yet, start fresh
  }

  metadataList.push(metadata);
  await fs.writeFile(METADATA_FILE, JSON.stringify(metadataList, null, 2));
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".txt": "text/plain",
    ".json": "application/json",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
  };

  return mimeTypes[ext] || "application/octet-stream";
}

export async function uploadFile(
  filePath: string,
  epochs: number = 3
): Promise<string> {
  // Validate file before uploading
  const validation = await validateFile(filePath);
  printValidationResult(validation);

  if (!validation.isValid) {
    throw new Error("File validation failed. Upload cancelled.");
  }

  const { walrusClient, signer } = await initWalrus();

  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);

  console.log(`Uploading ${fileName} (${fileBuffer.length} bytes)...`);

  // Upload as raw blob (following documentation)
  const result = await walrusClient.writeBlob({
    blob: new Uint8Array(fileBuffer),
    deletable: true,
    epochs,
    signer,
  });

  const blobId = result.blobId;

  // Save metadata locally
  await saveMetadata({
    blobId,
    originalName: fileName,
    contentType: getMimeType(fileName),
    size: fileBuffer.length,
    uploadedAt: new Date().toISOString(),
  });

  console.log(`✅ Uploaded ${fileName}`);
  console.log(`Blob ID: ${blobId}`);
  console.log(`Metadata saved to ${METADATA_FILE}`);

  return blobId;
}