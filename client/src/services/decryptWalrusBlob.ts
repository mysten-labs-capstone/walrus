import { decryptWithWrappedKey } from './crypto';

const MAGIC_V2 = new TextEncoder().encode('WALRUS2'); // per-file key version

function bytesToU32(bytes: Uint8Array): number {
  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
}

/**
 * Decrypt a WALRUS2 (per-file key) encrypted blob.
 * The legacy global-key (WALRUS1) path has been removed — only per-file wrapped keys
 * are supported now.
 */
export async function decryptWalrusBlob(
  blob: Blob,
  accountMasterKeyHex: string,
  fallbackBaseName: string,
  wrappedFileKey?: string
): Promise<{ blob: Blob; suggestedName: string } | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < MAGIC_V2.length + 4) return null;

  // Require WALRUS2 magic
  for (let i = 0; i < MAGIC_V2.length; i++) {
    if (buf[i] !== MAGIC_V2[i]) return null;
  }

  if (!wrappedFileKey) {
    console.warn('[decryptWalrusBlob] WALRUS2 requires wrappedFileKey');
    return null;
  }

  try {
    return await decryptWithWrappedKey(blob, wrappedFileKey, accountMasterKeyHex, fallbackBaseName);
  } catch (err) {
    console.error('[decryptWalrusBlob] WALRUS2 decryption failed:', err);
    return null;
  }
}
