// client/src/scripts/download.ts
import fs from "fs/promises";
import path from "path";
import { initWalrus } from "./utils/walrusClient.js";
import { EncryptionService, EncryptionMetadata } from "./utils/encryptionService.js";
import { KeyManager } from "./utils/keyManager.js";

interface BlobMetadata {
  blobId: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  encrypted: boolean;
  encryptionMetadata?: EncryptionMetadata;
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

/**
 * Download and optionally decrypt blob from Walrus
 * @param blobId - ID of blob to download
 * @param outputDir - Directory to save file (default: current directory)
 * @param outputName - Custom output filename (optional)
 * @param options - Download options
 */
export async function downloadBlob(
  blobId: string,
  outputDir: string = ".",
  outputName?: string,
  options: {
    skipDecryption?: boolean;
    key?: string; // New: Direct key string (base64)
  } = {}
): Promise<string> {
  const { skipDecryption = false, key: providedKey } = options;
  const { walrusClient } = await initWalrus();

  const encryptedBlob = await walrusClient.readBlob({ blobId });
  const encryptedBuffer: Buffer = Buffer.from(encryptedBlob);
  const metadata = await getMetadata(blobId);
  let decryptedData: Buffer = Buffer.from(encryptedBuffer);
  let isEncrypted = false;

  // Check if blob is encrypted and decrypt if needed
  if (metadata?.encrypted && !skipDecryption) {
    isEncrypted = true;
    let encryptionKey: Buffer | null = null;

    // Try provided key first, then keystore
    if (providedKey) {
      try {
        encryptionKey = EncryptionService.importKey(providedKey);
      } catch (error) {
        throw new Error("Invalid encryption key format");
      }
    } else {
      // Get encryption key from keystore
      const keyManager = new KeyManager();
      encryptionKey = await keyManager.getKey(blobId);

      if (!encryptionKey) {
        throw new Error(
          `Missing encryption key. Use --key <key-string> or import the key.`
        );
      }
    }

    if (!metadata.encryptionMetadata) {
      throw new Error("Encryption metadata missing from blob metadata");
    }

    const { iv, authTag } = EncryptionService.parseMetadata(
      metadata.encryptionMetadata
    );

    try {
      decryptedData = EncryptionService.decrypt({
        encryptedData: encryptedBuffer,
        iv,
        authTag,
        key: encryptionKey,
      });

    } catch (error) {
      console.error(error);
      throw new Error("Failed to decrypt file. The encryption key may be incorrect.");
    }
  } else if (metadata?.encrypted && skipDecryption) {
  }

  await fs.mkdir(outputDir, { recursive: true });

  // Use provided name, or metadata name, or blob ID
  let fileName = outputName || metadata?.originalName || `${blobId}.bin`;
  
  // Add .encrypted suffix if file is encrypted and we didn't decrypt
  if (isEncrypted && skipDecryption && !fileName.endsWith('.encrypted')) {
    fileName += '.encrypted';
  }

  const outPath = path.resolve(outputDir, fileName);
  await fs.writeFile(outPath, decryptedData);
    
  return outPath;
}