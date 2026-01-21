import { decryptWithWrappedKey } from "./crypto";

const E2E_MAGIC = new TextEncoder().encode("E2E_ENCRYPTED"); // E2E encryption format

function bytesToU32(bytes: Uint8Array): number {
  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
}

/**
 * Decrypt an E2E encrypted blob.
 * All files are now encrypted client-side with per-file keys.
 */
export async function decryptWalrusBlob(
  blob: Blob,
  accountMasterKeyHex: string,
  fallbackBaseName: string,
  wrappedFileKey?: string,
): Promise<{ blob: Blob; suggestedName: string } | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < E2E_MAGIC.length + 4) return null;

  // Require E2E_MAGIC
  for (let i = 0; i < E2E_MAGIC.length; i++) {
    if (buf[i] !== E2E_MAGIC[i]) return null;
  }

  if (!wrappedFileKey) {
    console.warn(
      "[decryptWalrusBlob] E2E encrypted files require wrappedFileKey",
    );
    return null;
  }

  try {
    return await decryptWithWrappedKey(
      blob,
      wrappedFileKey,
      accountMasterKeyHex,
      fallbackBaseName,
    );
  } catch (err) {
    console.error("[decryptWalrusBlob] E2E decryption failed:", err);
    return null;
  }
}
