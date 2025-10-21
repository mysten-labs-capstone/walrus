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

  console.log(`📥 Downloading blob ${blobId}...`);

  const encryptedBlob = await walrusClient.readBlob({ blobId });
  console.log(`✅ Downloaded ${encryptedBlob.length} bytes`);

  const metadata = await getMetadata(blobId);
  let decryptedData = Buffer.from(encryptedBlob);
  let isEncrypted = false;

  // Check if blob is encrypted and decrypt if needed
  if (metadata?.encrypted && !skipDecryption) {
    isEncrypted = true;
    console.log(`\n🔒 File is encrypted, attempting decryption...`);

    let encryptionKey: Buffer | null = null;

    // Try provided key first, then keystore
    if (providedKey) {
      console.log(`🔑 Using provided encryption key`);
      try {
        encryptionKey = EncryptionService.importKey(providedKey);
      } catch (error) {
        console.error(`❌ Invalid key format. Expected base64-encoded string.`);
        throw new Error("Invalid encryption key format");
      }
    } else {
      // Get encryption key from keystore
      const keyManager = new KeyManager();
      encryptionKey = await keyManager.getKey(blobId);

      if (!encryptionKey) {
        console.error(`\n❌ No encryption key found for blob ${blobId}`);
        console.error(`Cannot decrypt file. Key may be missing from keystore.`);
        console.log(`\nKeystore location: ${keyManager.getKeystorePath()}`);
        console.log(`\n💡 Options:`);
        console.log(`   1. Import key: npx tsx src/scripts/index.ts keys import <keyfile.json>`);
        console.log(`   2. Use key directly: --key <base64-key-string>`);
        console.log(`   3. Download encrypted: --skip-decryption`);
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
        encryptedData: Buffer.from(encryptedBlob),
        iv,
        authTag,
        key: encryptionKey,
      });

      console.log(`✅ Decryption successful`);
      console.log(`📦 Decrypted size: ${decryptedData.length} bytes`);
    } catch (error) {
      console.error(`\n❌ Decryption failed!`);
      console.error(error);
      throw new Error("Failed to decrypt file. The encryption key may be incorrect.");
    }
  } else if (metadata?.encrypted && skipDecryption) {
    console.log(`\n⚠️  File is encrypted but decryption was skipped`);
    console.log(`    The downloaded file will remain encrypted`);
  }

  // Display metadata if available
  if (metadata) {
    console.log(`\n📄 File Information:`);
    console.log(`   Name: ${metadata.originalName}`);
    console.log(`   Type: ${metadata.contentType}`);
    console.log(`   Original size: ${metadata.size} bytes`);
    console.log(`   Encrypted: ${metadata.encrypted ? 'Yes' : 'No'}`);
    console.log(`   Uploaded: ${new Date(metadata.uploadedAt).toLocaleString()}`);
  }

  await fs.mkdir(outputDir, { recursive: true });

  // Use provided name, or metadata name, or blob ID
  let fileName = outputName || metadata?.originalName || `${blobId}.bin`;
  
  // Add .encrypted suffix if file is encrypted and we didn't decrypt
  if (isEncrypted && skipDecryption && !fileName.endsWith('.encrypted')) {
    fileName += '.encrypted';
  }

  const outPath = path.resolve(outputDir, fileName);
  console.log(`\n💾 Saving to: ${outPath}`);

  await fs.writeFile(outPath, decryptedData);
  
  console.log(`✅ Saved ${isEncrypted && !skipDecryption ? 'decrypted ' : ''}file`);
  console.log(`   Size: ${decryptedData.length} bytes`);
  
  return outPath;
}