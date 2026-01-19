/**
 * Per-file encryption key management
 * 
 * Security model:
 * - Each file has a unique random encryption key (fileKey)
 * - fileKey is wrapped using a KEK derived from the account master key
 * - Backend stores only the wrapped key (wrappedFileKey)
 * - Share links contain the unwrapped fileKey in the URL fragment (#k=...)
 * - Backend never sees plaintext fileKeys
 */

const SALT_PREFIX = 'walrus-kek-v1:';
const KEK_INFO = 'file-key-encryption-key';

/**
 * Derive a Key Encryption Key (KEK) from the account master key
 * Uses HKDF to derive a stable KEK for wrapping/unwrapping file keys
 */
export async function deriveKEK(accountMasterKeyHex: string): Promise<CryptoKey> {
  // Convert hex master key to bytes
  const masterKeyBytes = hexToBytes(accountMasterKeyHex);
  
  // Import master key as raw key material
  const masterKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes.buffer as ArrayBuffer,
    'HKDF',
    false,
    ['deriveKey']
  );
  
  // Use HKDF to derive a KEK
  // Salt includes version for key rotation support
  const salt = new TextEncoder().encode(SALT_PREFIX + accountMasterKeyHex.slice(0, 16));
  const info = new TextEncoder().encode(KEK_INFO);
  
  const kek = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['wrapKey', 'unwrapKey']
  );
  
  return kek;
}

/**
 * Generate a random per-file encryption key
 */
export async function generateFileKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable (needed for wrapping and share links)
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap a file encryption key using the KEK
 * Returns base64-encoded wrapped key suitable for database storage
 */
export async function wrapFileKey(
  fileKey: CryptoKey,
  kek: CryptoKey
): Promise<string> {
  // Generate random IV for wrapping
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const wrappedKeyBytes = await crypto.subtle.wrapKey(
    'raw',
    fileKey,
    kek,
    { name: 'AES-GCM', iv }
  );
  
  // Prepend IV to wrapped key: [12 bytes IV][wrapped key]
  const result = new Uint8Array(iv.length + wrappedKeyBytes.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(wrappedKeyBytes), iv.length);
  
  return bytesToBase64(result);
}

/**
 * Unwrap a file encryption key using the KEK
 */
export async function unwrapFileKey(
  wrappedFileKeyBase64: string,
  kek: CryptoKey
): Promise<CryptoKey> {
  const wrappedData = base64ToBytes(wrappedFileKeyBase64);
  // Extract IV and wrapped key
  const iv = wrappedData.slice(0, 12);
  const wrappedKeyBytes = wrappedData.slice(12);
  const fileKey = await crypto.subtle.unwrapKey(
    'raw',
    wrappedKeyBytes,
    kek,
    { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 },
    true, // extractable (needed for share links)
    ['encrypt', 'decrypt']
  );

  return fileKey;
}

/**
 * Export a file key to base64 for inclusion in share links (URL fragment only!)
 * WARNING: Never send this to the server or include in query params
 */
export async function exportFileKeyForShare(fileKey: CryptoKey): Promise<string> {
  const keyBytes = await crypto.subtle.exportKey('raw', fileKey);
  return bytesToBase64url(new Uint8Array(keyBytes));
}

/**
 * Import a file key from a share link URL fragment
 */
export async function importFileKeyFromShare(base64urlKey: string): Promise<CryptoKey> {
  const keyBytes = base64urlToBytes(base64urlKey);
  
  return crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable once imported from share
    ['decrypt'] // share recipients can only decrypt
  );
}

/**
 * Encrypt file data with a file key
 */
export async function encryptFile(
  data: ArrayBuffer,
  fileKey: CryptoKey
): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    fileKey,
    data
  );
  
  // Prepend IV to encrypted data: [12 bytes IV][encrypted data]
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return result.buffer;
}

/**
 * Decrypt file data with a file key
 */
export async function decryptFile(
  encryptedData: ArrayBuffer,
  fileKey: CryptoKey
): Promise<ArrayBuffer> {
  const data = new Uint8Array(encryptedData);
  
  // Extract IV and ciphertext
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  try {
    return await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      fileKey,
      ciphertext
    );
  } catch (err) {
    console.error('[decryptFile] AES-GCM decrypt failed:', err);
    console.log('[decryptFile] iv:', Array.from(iv).map(b => b.toString(16).padStart(2,'0')).join(''));
    console.log('[decryptFile] ciphertext.length:', ciphertext.length);
    throw err;
  }
}

// Utility functions

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/i, '');
  if (clean.length % 2 !== 0) {
    throw new Error('Invalid hex string length');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  const binString = String.fromCharCode(...bytes);
  return btoa(binString);
}

function base64ToBytes(base64: string): Uint8Array {
  const binString = atob(base64);
  return Uint8Array.from(binString, (char) => char.charCodeAt(0));
}

function bytesToBase64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return base64ToBytes(padded);
}
