/**
 * HKDF-based File Encryption System
 * 
 * New architecture for offline decryption:
 * - Uses deterministic key derivation (HKDF-SHA256) instead of KEK wrapping
 * - All decryption info embedded in the blob itself
 * - No database access required for decryption
 * - Compatible with smart contracts and offline tools
 * 
 * Blob structure: [fileId (32 bytes)][IV (12 bytes)][ciphertext]
 * 
 * Security model:
 * - Master key (256-bit) derived from 12-word seed phrase
 * - File key = HKDF(masterKey, fileId, "file-encryption-v1")
 * - Each file gets unique random fileId and IV
 * - AES-256-GCM for authenticated encryption
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/, '');
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Base64url encode for URL-safe sharing
 */
function base64urlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Base64url decode
 */
function base64urlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return new Uint8Array(binary.split('').map(c => c.charCodeAt(0)));
}

/**
 * Derive a file-specific encryption key using HKDF-SHA256
 * 
 * @param masterKeyHex - Account master key (256-bit hex)
 * @param fileId - Random file identifier (32 bytes)
 * @returns CryptoKey for AES-GCM encryption
 */
async function deriveFileKey(
  masterKeyHex: string,
  fileId: Uint8Array,
): Promise<CryptoKey> {
  const masterKeyBytes = hexToBytes(masterKeyHex);
  
  // Import master key as HKDF key material
  const masterKey = await crypto.subtle.importKey(
    'raw',
    masterKeyBytes,
    'HKDF',
    false,
    ['deriveKey'],
  );
  
  // Use HKDF to derive file-specific key
  // Salt: fileId (32 bytes of randomness)
  // Info: context string for domain separation
  const info = new TextEncoder().encode('file-encryption-v1');
  
  const fileKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: fileId,
      info,
    },
    masterKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable for sharing
    ['encrypt', 'decrypt'],
  );
  
  return fileKey;
}

/**
 * Encrypt a file with deterministic key derivation
 * 
 * Output format: [fileId (32)][IV (12)][ciphertext]
 * - fileId: Random identifier for key derivation
 * - IV: Random initialization vector for AES-GCM
 * - ciphertext: Encrypted file data with authentication tag
 * 
 * @param file - File to encrypt
 * @param masterKeyHex - Account master key (256-bit hex)
 * @returns Encrypted blob with embedded decryption info
 */
export async function encryptFile(
  file: File,
  masterKeyHex: string,
): Promise<Blob> {
  // Generate random file identifier (32 bytes)
  const fileId = crypto.getRandomValues(new Uint8Array(32));
  
  // Generate random IV for AES-GCM (12 bytes recommended)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive file-specific encryption key
  const fileKey = await deriveFileKey(masterKeyHex, fileId);
  
  // Encrypt file data
  const fileData = await file.arrayBuffer();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    fileKey,
    fileData,
  );
  
  // Assemble blob: [fileId][IV][ciphertext]
  const encryptedData = new Uint8Array(32 + 12 + ciphertext.byteLength);
  encryptedData.set(fileId, 0);
  encryptedData.set(iv, 32);
  encryptedData.set(new Uint8Array(ciphertext), 44);
  
  return new Blob([encryptedData], { type: 'application/octet-stream' });
}

/**
 * Decrypt a file using the master key
 * 
 * Extracts fileId and IV from blob, derives file key, decrypts
 * 
 * @param blob - Encrypted blob
 * @param masterKeyHex - Account master key (256-bit hex)
 * @param fallbackName - Filename to use if decryption succeeds
 * @returns Decrypted blob and filename, or null if decryption fails
 */
export async function decryptFile(
  blob: Blob,
  masterKeyHex: string,
  fallbackName: string,
): Promise<{ blob: Blob; suggestedName: string } | null> {
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    
    // Minimum size: 32 (fileId) + 12 (IV) + 16 (GCM tag)
    if (data.length < 60) {
      console.error('[decryptFile] Blob too small');
      return null;
    }
    
    // Extract components
    const fileId = data.slice(0, 32);
    const iv = data.slice(32, 44);
    const ciphertext = data.slice(44);
    
    // Derive file key
    const fileKey = await deriveFileKey(masterKeyHex, fileId);
    
    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      fileKey,
      ciphertext,
    );
    
    return {
      blob: new Blob([plaintext]),
      suggestedName: fallbackName,
    };
  } catch (err) {
    console.error('[decryptFile] Decryption failed:', err);
    return null;
  }
}

/**
 * Decrypt a file using a direct file key (for share recipients)
 * 
 * @param blob - Encrypted blob
 * @param fileKeyBase64url - File key encoded as base64url (from share URL)
 * @param fallbackName - Filename to use if decryption succeeds
 * @returns Decrypted blob and filename, or null if decryption fails
 */
export async function decryptWithSharedKey(
  blob: Blob,
  fileKeyBase64url: string,
  fallbackName: string,
): Promise<{ blob: Blob; suggestedName: string } | null> {
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    
    if (data.length < 60) {
      console.error('[decryptWithSharedKey] Blob too small');
      return null;
    }
    
    // Extract IV and ciphertext (fileId not needed when we have the key)
    const iv = data.slice(32, 44);
    const ciphertext = data.slice(44);
    
    // Import the shared file key
    const keyBytes = base64urlDecode(fileKeyBase64url);
    const fileKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    
    // Decrypt
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      fileKey,
      ciphertext,
    );
    
    return {
      blob: new Blob([plaintext]),
      suggestedName: fallbackName,
    };
  } catch (err) {
    console.error('[decryptWithSharedKey] Decryption failed:', err);
    return null;
  }
}

/**
 * Export a file key for sharing via URL fragment
 * 
 * Downloads the encrypted blob, extracts fileId, derives key, exports as base64url
 * 
 * @param blobData - Encrypted blob data
 * @param masterKeyHex - Account master key
 * @returns Base64url-encoded file key for URL fragment
 */
export async function exportFileKeyForShare(
  blobData: Blob,
  masterKeyHex: string,
): Promise<string> {
  const data = new Uint8Array(await blobData.arrayBuffer());
  
  if (data.length < 60) {
    throw new Error('Invalid encrypted blob');
  }
  
  // Extract fileId
  const fileId = data.slice(0, 32);
  
  // Derive file key
  const fileKey = await deriveFileKey(masterKeyHex, fileId);
  
  // Export and encode
  const keyBytes = await crypto.subtle.exportKey('raw', fileKey);
  return base64urlEncode(new Uint8Array(keyBytes));
}

/**
 * Sui Blockchain Integration
 * Derives Ed25519 keypair from master key for blockchain identity
 */

const SUI_DERIVATION_DOMAIN = 'infinity-storage-sui-identity-v1';

/**
 * Derive Sui Ed25519 keypair from master encryption key
 * Uses SHA-256 with domain separation for one-way derivation
 */
export function deriveSuiKeypair(masterKey: Uint8Array): Ed25519Keypair {
  const domainBytes = new TextEncoder().encode(SUI_DERIVATION_DOMAIN);
  const combined = new Uint8Array(masterKey.length + domainBytes.length);
  combined.set(masterKey);
  combined.set(domainBytes, masterKey.length);
  const seed = sha256(combined);
  return Ed25519Keypair.fromSecretKey(seed);
}

/**
 * Get Sui blockchain address from master key
 */
export function getSuiAddressFromMasterKey(masterKey: Uint8Array): string {
  return deriveSuiKeypair(masterKey).toSuiAddress();
}

/**
 * Extract fileId from encrypted blob
 * The fileId is the first 32 bytes of the encrypted blob
 */
export function extractFileIdFromBlob(encryptedBlob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arrayBuffer = reader.result as ArrayBuffer;
        const fileIdBytes = new Uint8Array(arrayBuffer).slice(0, 32);
        const fileIdHex = Array.from(fileIdBytes)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        resolve(fileIdHex);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(encryptedBlob.slice(0, 32));
  });
}
