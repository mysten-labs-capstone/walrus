import {
  generateFileKey,
  deriveKEK,
  wrapFileKey,
  unwrapFileKey,
  exportFileKeyForShare,
  importFileKeyFromShare,
  encryptFile as encryptFileWithKey,
  decryptFile as decryptFileWithKey,
} from './fileKeyManagement';

// New envelope for per-file key encryption
export type PerFileKeyEnvelope = {
  alg: 'PER-FILE-KEY-V1';
  ext: string; // file extension
};

const MAGIC_V2 = new TextEncoder().encode('WALRUS2'); // per-file key version

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf as ArrayBuffer;
}

function u32ToBytes(num: number): Uint8Array {
  return new Uint8Array([
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff,
  ]);
}

function bytesToU32(bytes: Uint8Array): number {
  return (
    (bytes[0] << 24) |
    (bytes[1] << 16) |
    (bytes[2] << 8) |
    bytes[3]
  );
}
/**
 * NEW: Encrypt a file using a per-file encryption key (wrapped by account master key).
 * Returns encrypted blob and the wrapped file key for server storage.
 * 
 * Output format: MAGIC_V2 | headerLen | headerJSON | encryptedFileData
 */
export async function encryptWithPerFileKey(
  file: File,
  accountMasterKeyHex: string
): Promise<{ encryptedBlob: Blob; wrappedFileKey: string; fileKey: CryptoKey }> {
  // Generate a random per-file encryption key
  const fileKey = await generateFileKey();
  
  // Encrypt the file data with the file key
  const fileData = await file.arrayBuffer();
  const encryptedData = await encryptFileWithKey(fileData, fileKey);
  
  // Derive KEK from account master key
  const kek = await deriveKEK(accountMasterKeyHex);
  
  // Wrap the file key for server storage
  const wrappedFileKey = await wrapFileKey(fileKey, kek);
  
  // Create envelope
  const header: PerFileKeyEnvelope = {
    alg: 'PER-FILE-KEY-V1',
    ext: (file.name.split('.').pop() || '').slice(0, 12),
  };
  
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const encryptedBytes = new Uint8Array(encryptedData);
  
  // Assemble: MAGIC_V2 | headerLen (4 bytes) | header | encrypted data
  const out = new Uint8Array(MAGIC_V2.length + 4 + headerBytes.length + encryptedBytes.length);
  out.set(MAGIC_V2, 0);
  out.set(u32ToBytes(headerBytes.length), MAGIC_V2.length);
  out.set(headerBytes, MAGIC_V2.length + 4);
  out.set(encryptedBytes, MAGIC_V2.length + 4 + headerBytes.length);
  
  return {
    encryptedBlob: new Blob([out], { type: 'application/octet-stream' }),
    wrappedFileKey,
    fileKey,
  };
}

/**
 * NEW: Decrypt a file using a wrapped file key (for file owner).
 * Unwraps the file key using the account master key, then decrypts.
 */
export async function decryptWithWrappedKey(
  blob: Blob,
  wrappedFileKey: string,
  accountMasterKeyHex: string,
  fallbackName: string
): Promise<{ blob: Blob; suggestedName: string } | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < MAGIC_V2.length + 4) return null;
  
  // Check MAGIC_V2
  for (let i = 0; i < MAGIC_V2.length; i++) {
    if (buf[i] !== MAGIC_V2[i]) return null;
  }
  
  const headerLen = bytesToU32(buf.subarray(MAGIC_V2.length, MAGIC_V2.length + 4));
  const start = MAGIC_V2.length + 4;
  const end = start + headerLen;
  if (end > buf.length) return null;
  
  try {
    const headerJson = new TextDecoder().decode(buf.subarray(start, end));
    const header = JSON.parse(headerJson) as PerFileKeyEnvelope;
    if (header.alg !== 'PER-FILE-KEY-V1') return null;
    
    // Derive KEK and unwrap file key
    const kek = await deriveKEK(accountMasterKeyHex);
    const fileKey = await unwrapFileKey(wrappedFileKey, kek);
    try {
      const exported = await crypto.subtle.exportKey('raw', fileKey) as ArrayBuffer;
      const arr = new Uint8Array(exported);
    } catch (e) {
    }
    
    // Decrypt file data - create a standalone ArrayBuffer for the slice
    const encryptedSlice = buf.subarray(end);
    const encryptedData = encryptedSlice.buffer.slice(
      encryptedSlice.byteOffset,
      encryptedSlice.byteOffset + encryptedSlice.byteLength
    );
    try {
      const peek = new Uint8Array(encryptedData).slice(0,16);
    } catch {}
    const plaintext = await decryptFileWithKey(encryptedData, fileKey);
    
    const ext = header.ext ? `.${header.ext}` : '';
    const name = fallbackName.replace(/\.[^.]*$/, '') + ext;
    
    return { blob: new Blob([new Uint8Array(plaintext)]), suggestedName: name };
  } catch (err) {
    return null;
  }
}

/**
 * NEW: Decrypt a file using a plaintext file key (for share recipients).
 * Used when the fileKey is provided directly in a share link's URL fragment.
 */
export async function decryptWithFileKey(
  blob: Blob,
  fileKey: CryptoKey,
  fallbackName: string
): Promise<{ blob: Blob; suggestedName: string } | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < MAGIC_V2.length + 4) return null;
  
  // Check MAGIC_V2
  for (let i = 0; i < MAGIC_V2.length; i++) {
    if (buf[i] !== MAGIC_V2[i]) return null;
  }
  
  const headerLen = bytesToU32(buf.subarray(MAGIC_V2.length, MAGIC_V2.length + 4));
  const start = MAGIC_V2.length + 4;
  const end = start + headerLen;
  if (end > buf.length) return null;
  
  try {
    const headerJson = new TextDecoder().decode(buf.subarray(start, end));
    const header = JSON.parse(headerJson) as PerFileKeyEnvelope;
    if (header.alg !== 'PER-FILE-KEY-V1') return null;
    
    // Decrypt file data directly with provided key
    const encryptedSlice = buf.subarray(end);
    const encryptedData = encryptedSlice.buffer.slice(
      encryptedSlice.byteOffset,
      encryptedSlice.byteOffset + encryptedSlice.byteLength
    );
    const plaintext = await decryptFileWithKey(encryptedData, fileKey);
    
    const ext = header.ext ? `.${header.ext}` : '';
    const name = fallbackName.replace(/\.[^.]*$/, '') + ext;
    
    return { blob: new Blob([new Uint8Array(plaintext)]), suggestedName: name };
  } catch (err) {
    console.error('[decryptWithFileKey] Decryption failed:', err);
    return null;
  }
}

// Re-export per-file key functions for convenience
export {
  generateFileKey,
  deriveKEK,
  wrapFileKey,
  unwrapFileKey,
  exportFileKeyForShare,
  importFileKeyFromShare,
};