const MAGIC = new TextEncoder().encode("WALRUS1");

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function deriveAesKeyFromPrivateKeyHex(privateKeyHex: string, salt: Uint8Array): Promise<CryptoKey> {
  // remove 0x prefix if present
  const clean = privateKeyHex.replace(/^0x/, "");
  const keyBytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((x) => parseInt(x, 16)));

  const baseKey = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "HKDF", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      info: new Uint8Array(0),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptWalrusBlob(
  plainBuffer: ArrayBuffer | Buffer,
  originalName: string,
  privateKeyHex: string
): Promise<{ encrypted: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKeyFromPrivateKeyHex(privateKeyHex, salt);

  const ext = originalName.split(".").pop() || "";
  const envelope = {
    alg: "AES-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ext,
  };

  // Encrypt plaintext
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, aesKey, plainBuffer as ArrayBuffer)
  );

  // Header
  const headerJson = JSON.stringify(envelope);
  const headerBytes = new TextEncoder().encode(headerJson);

  const lenBuf = new Uint8Array(4);
  new DataView(lenBuf.buffer).setUint32(0, headerBytes.length, false);

  // Combine all pieces
  const combined = new Uint8Array(MAGIC.length + lenBuf.length + headerBytes.length + ciphertext.length);
  combined.set(MAGIC, 0);
  combined.set(lenBuf, MAGIC.length);
  combined.set(headerBytes, MAGIC.length + lenBuf.length);
  combined.set(ciphertext, MAGIC.length + lenBuf.length + headerBytes.length);

  return { encrypted: new Uint8Array(combined.buffer) };
}
