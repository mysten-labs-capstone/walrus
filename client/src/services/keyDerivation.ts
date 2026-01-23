/**
 * Client-side key derivation for true E2E encryption
 *
 * Security model (ProtonMail-style):
 * - Master encryption key stored as BIP39 mnemonic (user backs up offline)
 * - Password derives TWO keys via Argon2id + HKDF:
 *   1. auth_key: sent to server for authentication (server stores hash)
 *   2. enc_key: encrypts the master key (never leaves browser)
 * - Server never sees password, enc_key, or master_key
 * - Recovery via BIP39 mnemonic phrase + new password
 * - Keys stored only in memory during session
 *
 * SIGNUP Flow:
 * 1. Generate random salt (256 bits) for this user
 * 2. intermediate_key = Argon2id(password, salt, 256MB, 3 iterations)
 * 3. auth_key = HKDF(intermediate_key, "auth")
 * 4. enc_key = HKDF(intermediate_key, "encrypt")
 * 5. encrypted_master_key = AES-256-GCM(enc_key, master_key)
 * 6. Send to server: salt, hash(auth_key), encrypted_master_key
 *
 * LOGIN Flow:
 * 1. Fetch salt from server (public, non-sensitive)
 * 2. Derive intermediate_key, auth_key, enc_key using salt
 * 3. Send auth_key to server for verification
 * 4. Server returns encrypted_master_key
 * 5. Decrypt master_key using enc_key (AES-GCM ensures integrity)
 *
 * Protection against:
 * - Offline attacks: Argon2id is memory-hard (256MB) + GPU-resistant
 * - Rainbow tables: Random salt per user
 * - Wrong key usage: AES-GCM authentication tag ensures integrity
 */

import * as bip39 from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";
import { argon2id } from "hash-wasm";
import { hkdf as hkdfFn } from "@noble/hashes/hkdf.js";
import { sha256 as sha256Fn } from "@noble/hashes/sha2.js";

const KEY_LENGTH = 32; // 256 bits
const DOMAIN_SEPARATOR = "walrus-e2e-v2"; // Prevent cross-protocol attacks

// Argon2id parameters (aggressive for security)
// ~256MB memory, 3 iterations
// Takes ~1-2 seconds on modern CPU, ~10min on GPU (makes brute force expensive)
const ARGON2_MEMORY = 256 * 1024; // 256 MB in KB
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;

/**
 * Generate random salt for new user signup
 * Each user gets a unique random salt to prevent rainbow table attacks
 */
export function generateRandomSalt(): string {
  const saltBytes = crypto.getRandomValues(new Uint8Array(32)); // 256 bits
  // Return as hex string
  return Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive intermediate key from password using Argon2id
 * Memory-hard, GPU-resistant key derivation
 */
async function deriveIntermediateKey(
  password: string,
  saltHex: string,
): Promise<Uint8Array> {
  // hash-wasm expects base64 or hex strings for salt and returns hex
  const hashHex = await argon2id({
    password,
    salt: saltHex,
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY, // in KB
    hashLength: KEY_LENGTH, // output length in bytes
    outputType: "hex",
  });

  // Convert hex string to Uint8Array
  return new Uint8Array(
    hashHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );
}

/**
 * Split intermediate key into auth_key and enc_key using HKDF
 * Prevents server from learning enc_key when auth_key is sent for login
 */
function splitKeys(intermediateKey: Uint8Array): {
  authKey: string;
  encKey: Uint8Array;
} {
  // HKDF-SHA256 for key derivation
  const authKeyBytes = hkdfFn(
    sha256Fn,
    intermediateKey,
    undefined, // no salt needed (intermediate key is already salted)
    new TextEncoder().encode("auth"),
    KEY_LENGTH,
  );

  const encKeyBytes = hkdfFn(
    sha256Fn,
    intermediateKey,
    undefined,
    new TextEncoder().encode("encrypt"),
    KEY_LENGTH,
  );

  return {
    authKey: Array.from(authKeyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    encKey: encKeyBytes,
  };
}

/**
 * Derive authentication and encryption keys from password (for signup)
 * Generates a new random salt and returns it for server storage
 */
export async function deriveKeysFromPassword(password: string): Promise<{
  salt: string;
  authKey: string;
  encKey: Uint8Array;
}> {
  const salt = generateRandomSalt();
  const intermediateKey = await deriveIntermediateKey(password, salt);
  const { authKey, encKey } = splitKeys(intermediateKey);

  return { salt, authKey, encKey };
}

/**
 * Derive authentication and encryption keys from password with existing salt (for login)
 * Uses the salt stored on server to recreate the same keys
 */
export async function deriveKeysFromPasswordWithSalt(
  password: string,
  salt: string,
): Promise<{
  authKey: string;
  encKey: Uint8Array;
}> {
  const intermediateKey = await deriveIntermediateKey(password, salt);
  const { authKey, encKey } = splitKeys(intermediateKey);

  return { authKey, encKey };
}

/**
 * DEPRECATED: Old function for backward compatibility
 * Use deriveKeysFromPassword instead
 */
export async function deriveKeyFromPassword(
  password: string,
  username: string,
): Promise<string> {
  // For old accounts, generate deterministic salt from username
  const input = `${username.toLowerCase()}||walrus-e2e-v1`;
  const saltBytes = sha256Fn(new TextEncoder().encode(input));
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { encKey } = await deriveKeysFromPasswordWithSalt(password, salt);
  return Array.from(encKey)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a BIP39 recovery phrase (12 words)
 * This represents the master encryption key and should be stored offline
 */
export function generateRecoveryPhrase(): string {
  const entropy = crypto.getRandomValues(new Uint8Array(16)); // 128 bits = 12 words
  return bip39.entropyToMnemonic(entropy, englishWordlist);
}

/**
 * Validate a BIP39 recovery phrase
 */
export function validateRecoveryPhrase(phrase: string): boolean {
  try {
    return bip39.validateMnemonic(phrase, englishWordlist);
  } catch {
    return false;
  }
}

/**
 * Derive a master encryption key from a recovery phrase
 * The phrase entropy is directly used as the key material
 */
export function deriveKeyFromRecoveryPhrase(phrase: string): string {
  if (!validateRecoveryPhrase(phrase)) {
    throw new Error("Invalid recovery phrase");
  }

  const entropyBytes = bip39.mnemonicToEntropy(phrase, englishWordlist);

  // Pad or truncate to 32 bytes if needed
  const keyBytes = new Uint8Array(KEY_LENGTH);
  keyBytes.set(entropyBytes.slice(0, KEY_LENGTH));

  return Array.from(keyBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Encrypt master key (from BIP39) using encryption key derived from password
 * Uses AES-256-GCM for authenticated encryption
 * Format: IV (12 bytes) || ciphertext || auth_tag (16 bytes, included in ciphertext)
 */
export async function encryptMasterKey(
  masterKeyHex: string,
  encKey: Uint8Array,
): Promise<string> {
  // Import encKey as AES-GCM key (create a copy to ensure proper ArrayBuffer)
  const encKeyBuffer = new Uint8Array(encKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encKeyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt master key
  const masterKeyBytes = new Uint8Array(
    masterKeyHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
  );

  // AES-GCM automatically includes authentication tag
  const encryptedBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    masterKeyBytes,
  );

  // Combine IV + ciphertext+tag
  const combined = new Uint8Array(iv.length + encryptedBytes.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBytes), iv.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt master key using encryption key
 * AES-GCM authentication tag ensures we fail fast if wrong key is used
 */
export async function decryptMasterKey(
  encryptedMasterKeyBase64: string,
  encKey: Uint8Array,
): Promise<string> {
  // Import encKey as AES-GCM key (create a copy to ensure proper ArrayBuffer)
  const encKeyBuffer = new Uint8Array(encKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encKeyBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedMasterKeyBase64), (c) =>
    c.charCodeAt(0),
  );

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encryptedBytes = combined.slice(12);

  try {
    // Decrypt - will throw if authentication tag fails (wrong key/tampered data)
    const decryptedBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      encryptedBytes,
    );

    const masterKeyBytes = new Uint8Array(decryptedBytes);
    return Array.from(masterKeyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch (err) {
    throw new Error("Decryption failed - invalid key or corrupted data");
  }
}

/**
 * DEPRECATED: Encrypt recovery phrase (old flow)
 * Use encryptMasterKey instead for new implementations
 */
export async function encryptRecoveryPhrase(
  phrase: string,
  password: string,
  username: string,
): Promise<string> {
  // For backward compatibility, generate deterministic salt from username
  const input = `${username.toLowerCase()}||walrus-e2e-v1`;
  const saltBytes = sha256Fn(new TextEncoder().encode(input));
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { encKey } = await deriveKeysFromPasswordWithSalt(password, salt);

  // Import as AES-GCM key (create a copy to ensure proper ArrayBuffer)
  const encKeyBuffer = new Uint8Array(encKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encKeyBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt phrase
  const phraseBytes = new TextEncoder().encode(phrase);
  const encryptedBytes = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    phraseBytes,
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encryptedBytes.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBytes), iv.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * DEPRECATED: Decrypt recovery phrase (old flow)
 * Use decryptMasterKey instead for new implementations
 */
export async function decryptRecoveryPhrase(
  encryptedPhraseBase64: string,
  password: string,
  username: string,
): Promise<string> {
  // For backward compatibility, generate deterministic salt from username
  const input = `${username.toLowerCase()}||walrus-e2e-v1`;
  const saltBytes = sha256Fn(new TextEncoder().encode(input));
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { encKey } = await deriveKeysFromPasswordWithSalt(password, salt);

  // Import as AES-GCM key (create a copy to ensure proper ArrayBuffer)
  const encKeyBuffer = new Uint8Array(encKey);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encKeyBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedPhraseBase64), (c) =>
    c.charCodeAt(0),
  );

  // Extract IV and encrypted data
  const iv = combined.slice(0, 12);
  const encryptedBytes = combined.slice(12);

  // Decrypt
  const decryptedBytes = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encryptedBytes,
  );

  return new TextDecoder().decode(decryptedBytes);
}
