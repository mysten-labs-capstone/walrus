// client/src/scripts/download.ts
import fs from "fs/promises";
import path from "path";
import { initWalrus } from "./utils/walrusClient.js";
import { EncryptionService, EncryptionMetadata } from "./utils/encryptionService.js";
import { KeyManager } from "./utils/keyManager.js";
import { EncryptionChecker } from "./utils/encryptionChecker.js";

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
    skipEncryptionCheck?: boolean; // Skip pre-download warnings
  } = {}
): Promise<string> {
  const { skipDecryption = false, key: providedKey, skipEncryptionCheck = false } = options;
  
  // PRE-DOWNLOAD ENCRYPTION CHECK
  if (!skipEncryptionCheck && !skipDecryption) {
    const encryptionChecker = new EncryptionChecker();
    console.log(`\n🔍 Checking encryption status for blob ${blobId}...\n`);
    
    const canDecrypt = await encryptionChecker.displayEncryptionWarnings(
      blobId,
      providedKey
    );

    if (!canDecrypt) {
      console.error(encryptionChecker.getEncryptionErrorMessage(blobId));
      throw new Error(
        `Cannot decrypt blob ${blobId}. Use --key <base64-key> to provide the decryption key, ` +
        `or --skip-decryption to download the encrypted file.`
      );
    }
  }

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
        const encryptionChecker = new EncryptionChecker(keyManager);
        console.error(`\n❌ DECRYPTION KEY NOT FOUND`);
        console.error(`Cannot decrypt file. Key may be missing from keystore.`);
        console.log(`\nKeystore location: ${keyManager.getKeystorePath()}`);
        console.log(encryptionChecker.getEncryptionErrorMessage(blobId));
        
        throw new Error(
          `Missing encryption key for blob ${blobId}. ` +
          `Use --key <key-string> to provide the key, or --skip-decryption to download encrypted.`
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
      console.error(`\n❌ DECRYPTION FAILED!`);
      console.error(`\n⚠️  The file could not be decrypted. Possible reasons:`);
      console.error(`   • Incorrect decryption key`);
      console.error(`   • Corrupted encryption metadata`);
      console.error(`   • File was tampered with`);
      console.error(`\n📋 Error details:`, error);
      
      throw new Error(
        `Failed to decrypt blob ${blobId}. ` +
        `The encryption key may be incorrect or the file may be corrupted. ` +
        `Original error: ${(error as Error).message}`
      );
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