import { decryptFile } from "./crypto";

/**
 * Decrypt a file blob using HKDF-based encryption.
 * The new system stores encryption metadata within the blob itself.
 */
export async function decryptWalrusBlob(
  blob: Blob,
  accountMasterKeyHex: string,
  fallbackBaseName: string,
  wrappedFileKey?: string, // Deprecated parameter, kept for compatibility
): Promise<{ blob: Blob; suggestedName: string } | null> {
  try {
    // Use the new HKDF-based decryption which extracts fileId from the blob
    return await decryptFile(blob, accountMasterKeyHex, fallbackBaseName);
  } catch (err) {
    console.error("[decryptWalrusBlob] Decryption failed:", err);
    return null;
  }
}
