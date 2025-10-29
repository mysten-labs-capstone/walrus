export type EncryptEnvelope = {
  alg: 'AES-GCM';
  salt: string; // base64
  iv: string;   // base64
  ext: string;  // file extension (e.g. "pdf")
  keyDerivation?: 'hkdf-privatekey' | 'master-user-hash'; // Key derivation method
};

const MAGIC = new TextEncoder().encode("WALRUS1"); // 7 bytes

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

// --- Base64 helpers (no external utils needed) ---
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Convert hex string to bytes (supports 0x prefix)
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// --- HKDF-SHA256 Private Key → AES-GCM Key Derivation ---
// LEGACY METHOD: For backward compatibility only
async function deriveAesKeyFromPrivateKeyHex(
  privateKeyHex: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyBytes = hexToBytes(privateKeyHex);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),     // ensure ArrayBuffer (not SAB)
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),                // ensure ArrayBuffer
      info: toArrayBuffer(new Uint8Array(0)),   // empty ArrayBuffer
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// --- Master Key + User ID → AES-GCM Key Derivation ---
async function getMasterKey(): Promise<Uint8Array> {
  // Try to get from environment variable (for web app)
  const envMasterKey = import.meta.env?.VITE_WALRUS_MASTER_ENCRYPTION_KEY;
  
  if (envMasterKey) {
    return hexToBytes(envMasterKey);
  }
  
  // For development: use a deterministic master key
  // In production, this should be set in .env
  const devKey = "walrus-dev-master-key-change-in-production-0123456789abcdef";
  const encoder = new TextEncoder();
  const keyData = encoder.encode(devKey);
  
  // Hash to get consistent 32-byte key
  const hashBuffer = await crypto.subtle.digest('SHA-256', toArrayBuffer(keyData));
  return new Uint8Array(hashBuffer);
}

async function deriveUserIdHash(privateKeyHex: string): Promise<Uint8Array> {
  // Derive the Sui address from the private key
  // For Ed25519, the address is derived from the public key
  const keyBytes = hexToBytes(privateKeyHex);
  
  // Hash the private key bytes to create user ID hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', toArrayBuffer(keyBytes));
  return new Uint8Array(hashBuffer);
}

async function deriveAesKeyFromMasterAndUserId(
  privateKeyHex: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const masterKey = await getMasterKey();
  const userIdHash = await deriveUserIdHash(privateKeyHex);
  
  // Combine master key and user ID hash
  const combined = new Uint8Array(masterKey.length + userIdHash.length);
  combined.set(masterKey, 0);
  combined.set(userIdHash, masterKey.length);
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(combined),
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(new TextEncoder().encode('walrus-file-encryption')),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a File into a Blob using HKDF-AES-GCM with Master Key + User ID.
 * Output format: MAGIC | headerLen | headerJSON | ciphertext
 */
export async function encryptToBlob(
  file: File,
  privateKeyHex: string
): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Use new key derivation method: Master Key + User ID
  const aesKey = await deriveAesKeyFromMasterAndUserId(privateKeyHex, salt);

  const data = new Uint8Array(await file.arrayBuffer());

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      toArrayBuffer(data)
    )
  );

  const header: EncryptEnvelope = {
    alg: 'AES-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ext: (file.name.split('.').pop() || '').slice(0, 12),
    keyDerivation: 'master-user-hash',
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));

  const out = new Uint8Array(MAGIC.length + 4 + headerBytes.length + ciphertext.length);
  out.set(MAGIC, 0);
  out.set(u32ToBytes(headerBytes.length), MAGIC.length);
  out.set(headerBytes, MAGIC.length + 4);
  out.set(ciphertext, MAGIC.length + 4 + headerBytes.length);

  return new Blob([out], { type: 'application/octet-stream' });
}

/**
 * Try to decrypt a WALRUS encrypted Blob.
 * Returns null if not encrypted or if wrong key was used.
 * Supports both legacy (hkdf-privatekey) and new (master-user-hash) encryption.
 */
export async function tryDecryptToBlob(
  blob: Blob,
  privateKeyHex: string,
  fallbackName: string
): Promise<{ blob: Blob; suggestedName: string } | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < MAGIC.length + 4) return null;

  // Check MAGIC
  for (let i = 0; i < MAGIC.length; i++) {
    if (buf[i] !== MAGIC[i]) return null;
  }

  const headerLen = bytesToU32(buf.subarray(MAGIC.length, MAGIC.length + 4));
  const start = MAGIC.length + 4;
  const end = start + headerLen;
  if (end > buf.length) return null;

  try {
    const headerJson = new TextDecoder().decode(buf.subarray(start, end));
    const header = JSON.parse(headerJson) as EncryptEnvelope;
    if (header.alg !== 'AES-GCM') return null;

    const salt = fromBase64(header.salt);
    const iv = fromBase64(header.iv);
    
    // Use the appropriate key derivation method
    let aesKey: CryptoKey;
    if (header.keyDerivation === 'master-user-hash') {
      // New method: Master Key + User ID
      aesKey = await deriveAesKeyFromMasterAndUserId(privateKeyHex, salt);
    } else {
      // Legacy method: Direct private key HKDF
      aesKey = await deriveAesKeyFromPrivateKeyHex(privateKeyHex, salt);
    }

    const ciphertext = buf.subarray(end);

    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        aesKey,
        toArrayBuffer(ciphertext)
      )
    );

    const ext = header.ext ? `.${header.ext}` : '';
    const name = fallbackName.replace(/\.[^.]*$/, '') + ext;

    return { blob: new Blob([plaintext]), suggestedName: name };
  } catch {
    return null; // wrong key / corrupted data
  }
}
