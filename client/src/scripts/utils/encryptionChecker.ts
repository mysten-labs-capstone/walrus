// client/src/scripts/utils/encryptionChecker.ts
import fs from "fs/promises";
import { KeyManager } from "./keyManager.js";

export interface EncryptionMetadata {
  iv: string;
  authTag: string;
  algorithm: "aes-256-gcm";
  keyDerivation: "none" | "pbkdf2";
}

export interface BlobMetadata {
  blobId: string;
  originalName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  encrypted: boolean;
  encryptionMetadata?: EncryptionMetadata;
}

export interface EncryptionCheckResult {
  isEncrypted: boolean;
  hasKey: boolean;
  canDecrypt: boolean;
  metadata: BlobMetadata | null;
  warnings: string[];
  recommendations: string[];
}

const METADATA_FILE = "blob-metadata.json";

/**
 * Encryption Checker - Provides warnings and recommendations for encrypted blobs
 */
export class EncryptionChecker {
  private keyManager: KeyManager;

  constructor(keyManager?: KeyManager) {
    this.keyManager = keyManager || new KeyManager();
  }

  /**
   * Load metadata from file
   */
  private async getMetadata(blobId: string): Promise<BlobMetadata | null> {
    try {
      const data = await fs.readFile(METADATA_FILE, "utf-8");
      const metadataList: BlobMetadata[] = JSON.parse(data);
      return metadataList.find((m) => m.blobId === blobId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a blob is encrypted and if the user can decrypt it
   */
  async checkEncryptionStatus(
    blobId: string,
    providedKey?: string
  ): Promise<EncryptionCheckResult> {
    const metadata = await this.getMetadata(blobId);
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // No metadata found
    if (!metadata) {
      warnings.push("No metadata found for this blob ID");
      recommendations.push(
        "This blob may have been uploaded by someone else or metadata is missing"
      );
      recommendations.push(
        "You can still attempt to download, but encryption status is unknown"
      );

      return {
        isEncrypted: false,
        hasKey: false,
        canDecrypt: false,
        metadata: null,
        warnings,
        recommendations,
      };
    }

    // Not encrypted - all good
    if (!metadata.encrypted) {
      return {
        isEncrypted: false,
        hasKey: true,
        canDecrypt: true,
        metadata,
        warnings: [],
        recommendations: [],
      };
    }

    // Blob is encrypted - check if we have the key
    const hasKeyInStore = await this.keyManager.hasKey(blobId);
    const hasProvidedKey = !!providedKey;
    const hasKey = hasKeyInStore || hasProvidedKey;

    if (!hasKey) {
      warnings.push("⚠️  This blob is ENCRYPTED and you don't have the decryption key");
      warnings.push("Cannot decrypt without the encryption key");

      recommendations.push(
        "If you uploaded this file, check your keystore location:"
      );
      recommendations.push(`   ${this.keyManager.getKeystorePath()}`);
      recommendations.push("");
      recommendations.push("If someone shared this with you, ask them for the key:");
      recommendations.push("   npx tsx src/scripts/index.ts keys show <blobId>");
      recommendations.push("");
      recommendations.push("Then download with the key:");
      recommendations.push(
        `   npx tsx src/scripts/index.ts download ${blobId} . --key <base64-key>`
      );
      recommendations.push("");
      recommendations.push("Or import the key file:");
      recommendations.push(
        "   npx tsx src/scripts/index.ts keys import <keyfile.json>"
      );
    } else if (hasKeyInStore) {
      recommendations.push("✅ Decryption key found in local keystore");
      recommendations.push("File will be automatically decrypted on download");
    } else if (hasProvidedKey) {
      recommendations.push("✅ Decryption key provided");
      recommendations.push("File will be decrypted using the provided key");
    }

    return {
      isEncrypted: true,
      hasKey,
      canDecrypt: hasKey,
      metadata,
      warnings,
      recommendations,
    };
  }

  /**
   * Display encryption warnings to console
   */
  async displayEncryptionWarnings(blobId: string, providedKey?: string): Promise<boolean> {
    const result = await this.checkEncryptionStatus(blobId, providedKey);

    if (!result.isEncrypted) {
      return true; // Can proceed
    }

    console.log("\n" + "=".repeat(70));
    console.log("🔒 ENCRYPTED BLOB DETECTED");
    console.log("=".repeat(70));

    if (result.metadata) {
      console.log(`\n📄 File Information:`);
      console.log(`   Name: ${result.metadata.originalName}`);
      console.log(`   Size: ${result.metadata.size} bytes`);
      console.log(`   Type: ${result.metadata.contentType}`);
      console.log(`   Uploaded: ${new Date(result.metadata.uploadedAt).toLocaleString()}`);
    }

    if (result.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS:`);
      result.warnings.forEach((warning) => {
        console.log(`   ${warning}`);
      });
    }

    if (result.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS:`);
      result.recommendations.forEach((rec) => {
        console.log(`   ${rec}`);
      });
    }

    console.log("\n" + "=".repeat(70) + "\n");

    return result.canDecrypt;
  }

  /**
   * Get a user-friendly error message for encryption issues
   */
  getEncryptionErrorMessage(blobId: string): string {
    return `
╔═══════════════════════════════════════════════════════════════╗
║              ⚠️  ENCRYPTED FILE - KEY REQUIRED ⚠️             ║
╚═══════════════════════════════════════════════════════════════╝

This file (${blobId}) is encrypted and requires a decryption key.

🔑 You don't have the decryption key for this blob.

OPTIONS TO ACCESS THIS FILE:

1️⃣  If you uploaded this file:
   • Check your keystore: ${this.keyManager.getKeystorePath()}
   • The key may be missing or corrupted

2️⃣  If someone shared this file with you:
   • Ask them to export the key:
     $ npx tsx src/scripts/index.ts keys show ${blobId}
   
   • Then download with the key:
     $ npx tsx src/scripts/index.ts download ${blobId} . --key <their-key>

3️⃣  Import a key file if you have one:
   $ npx tsx src/scripts/index.ts keys import keyfile.json

4️⃣  Download encrypted (without decryption):
   $ npx tsx src/scripts/index.ts download ${blobId} . --skip-decryption

⚠️  WARNING: Without the correct key, this file CANNOT be decrypted!
`;
  }

  /**
   * Create a formatted notification message
   */
  createNotification(result: EncryptionCheckResult): {
    type: "success" | "warning" | "error" | "info";
    title: string;
    message: string;
  } {
    if (!result.isEncrypted) {
      return {
        type: "success",
        title: "Unencrypted File",
        message: "This file is not encrypted and can be downloaded normally.",
      };
    }

    if (result.canDecrypt) {
      return {
        type: "success",
        title: "Encrypted File - Key Available",
        message:
          "This file is encrypted but you have the decryption key. It will be automatically decrypted.",
      };
    }

    return {
      type: "error",
      title: "Encrypted File - Key Missing",
      message:
        "This file is encrypted and you don't have the decryption key. " +
        "You cannot decrypt this file without the key. " +
        "If someone shared this file with you, ask them for the encryption key.",
    };
  }
}
