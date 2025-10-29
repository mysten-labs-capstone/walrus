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
  } = {}
): Promise<string> {
  const { skipDecryption = false } = options;
  const { walrusClient, signer } = await initWalrus();
  const signerAddress = signer.toSuiAddress();

  console.log(`📥 Downloading blob ${blobId}...`);

  const encryptedBlob = await walrusClient.readBlob({ blobId });
  console.log(`✅ Downloaded ${encryptedBlob.length} bytes`);

  const encryptedBuffer: Buffer = Buffer.from(encryptedBlob);
  const metadata = await getMetadata(blobId);
  let decryptedData: Buffer = Buffer.from(encryptedBuffer);
  let isEncrypted = false;

  // Check if blob is encrypted and decrypt if needed
  if (metadata?.encrypted && !skipDecryption) {
    isEncrypted = true;
    console.log(`\n🔒 File is encrypted, attempting decryption...`);

    // With new key derivation, we derive the key from Master Key + User ID
    console.log(`🔑 Deriving key from Master Key + User ID (${signerAddress.slice(0, 8)}...)`);

    if (!metadata.encryptionMetadata) {
      throw new Error("Encryption metadata missing from blob metadata");
    }

    const { iv, authTag } = EncryptionService.parseMetadata(
      metadata.encryptionMetadata
    );

    try {
      // Check if this uses the new key derivation method
      if (metadata.encryptionMetadata.keyDerivation === "master-user-hash") {
        decryptedData = EncryptionService.decryptWithUserKey(
          {
            encryptedData: encryptedBuffer,
            iv,
            authTag,
          },
          signerAddress
        );
      } else {
        // Legacy encryption - need to get key from keystore
        console.log(`⚠️  File uses legacy encryption method`);
        const keyManager = new KeyManager();
        const encryptionKey = await keyManager.getKey(blobId);

        if (!encryptionKey) {
          console.error(`\n❌ No encryption key found for blob ${blobId}`);
          console.error(`Cannot decrypt file with legacy encryption.`);
          console.log(`\nKeystore location: ${keyManager.getKeystorePath()}`);
          console.log(`\n💡 Options:`);
          console.log(`   1. Import key: npx tsx src/scripts/index.ts keys import <keyfile.json>`);
          console.log(`   2. Download encrypted: --skip-decryption`);
          throw new Error(
            `Missing encryption key for legacy encrypted file.`
          );
        }

        decryptedData = EncryptionService.decrypt({
          encryptedData: encryptedBuffer,
          iv,
          authTag,
          key: encryptionKey,
        });
      }

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