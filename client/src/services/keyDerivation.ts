/**
 * Client-side key derivation for true E2E encryption
 *
 * Security model:
 * - Master encryption key derived from user password (PBKDF2)
 * - Server never sees the master key
 * - Recovery via BIP39 mnemonic phrase
 * - Key stored only in memory during session
 */

import * as bip39 from "@scure/bip39";
import { wordlist as englishWordlist } from "@scure/bip39/wordlists/english.js";

const PBKDF2_ITERATIONS = 600000; // OWASP 2023 recommendation
const KEY_LENGTH = 32; // 256 bits

/**
 * Derive a master encryption key from user password
 * Uses PBKDF2-SHA256 with high iteration count
 */
export async function deriveKeyFromPassword(
  password: string,
  username: string,
): Promise<string> {
  // Use username as part of salt for deterministic key generation
  const salt = new TextEncoder().encode(
    `walrus-e2e-v1:${username.toLowerCase()}`,
  );

  const passwordBuffer = new TextEncoder().encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  // Derive 256-bit key
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  // Convert to hex string (compatible with existing crypto functions)
  const keyBytes = new Uint8Array(derivedBits);
  return Array.from(keyBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a BIP39 recovery phrase (12 words)
 * This can be used to recover the account if password is lost
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
 * Uses the phrase entropy directly as the key material
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
 * Encrypt recovery phrase using password-derived key
 * This allows storing the phrase on the server while maintaining E2EE
 */
export async function encryptRecoveryPhrase(
  phrase: string,
  password: string,
  username: string,
): Promise<string> {
  // Derive encryption key from password
  const passwordKey = await deriveKeyFromPassword(password, username);
  const keyBytes = new Uint8Array(
    passwordKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)),
  );

  // Import as AES-GCM key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
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
 * Decrypt recovery phrase using password-derived key
 */
export async function decryptRecoveryPhrase(
  encryptedPhraseBase64: string,
  password: string,
  username: string,
): Promise<string> {
  // Derive decryption key from password
  const passwordKey = await deriveKeyFromPassword(password, username);
  const keyBytes = new Uint8Array(
    passwordKey.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16)),
  );

  // Import as AES-GCM key
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
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
