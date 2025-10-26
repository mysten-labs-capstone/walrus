export type EncryptEnvelope = {
  alg: 'AES-GCM';
  salt: string; // base64
  iv: string;   // base64
  ext: string;
};

const MAGIC = new TextEncoder().encode("WALRUS1"); // 7 bytes

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

function bytesToU32(bytes: Uint8Array): number {
  return (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '').toLowerCase();
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// HKDF-SHA256(privateKeyHex, salt) -> AES-GCM(256) key
async function deriveAesKeyFromPrivateKeyHex(
  privateKeyHex: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyBytes = hexToBytes(privateKeyHex);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(keyBytes),
    'HKDF',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(new Uint8Array(0)),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Try to decrypt a WALRUS-encrypted blob.
 * Returns null if the blob is not WALRUS or if the key is wrong.
 *
 * suggestedName = (<providedName or blobId>).<ext>
 */
export async function decryptWalrusBlob(
  blob: Blob,
  privateKeyHex: string,
  fallbackBaseName: string // blobId or user-input name (without extension handling)
): Promise<{ blob: Blob; suggestedName: string } | null> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  if (buf.length < MAGIC.length + 4) return null;

  // Magic check
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
    const aesKey = await deriveAesKeyFromPrivateKeyHex(privateKeyHex, salt);

    const ciphertext = buf.subarray(end);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        aesKey,
        toArrayBuffer(ciphertext)
      )
    );

    const ext = header.ext ? `.${header.ext}` : '';
    const suggestedName = `${fallbackBaseName}${ext}`;
    return { blob: new Blob([plaintext]), suggestedName };
  } catch {
    // wrong key or corrupted data
    return null;
  }
}
