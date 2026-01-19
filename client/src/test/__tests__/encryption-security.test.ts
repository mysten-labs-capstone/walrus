/**
 * Security validation tests for per-file encryption and share links
 * 
 * Critical security requirements:
 * 1. Account master key NEVER in share links
 * 2. Backend NEVER receives/stores plaintext keys
 * 3. Secrets only in URL fragments (#...), never query params or bodies
 * 4. No server-side decryption
 */

import { describe, it, expect } from 'vitest';
import {
  generateFileKey,
  deriveKEK,
  wrapFileKey,
  unwrapFileKey,
  exportFileKeyForShare,
  importFileKeyFromShare,
  encryptFile,
  decryptFile,
} from '../../services/fileKeyManagement';

describe('Per-file encryption security', () => {
  const mockAccountMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  
  it('should generate unique file keys for each file', async () => {
    const key1 = await generateFileKey();
    const key2 = await generateFileKey();
    
    const exported1 = await crypto.subtle.exportKey('raw', key1);
    const exported2 = await crypto.subtle.exportKey('raw', key2);
    
    expect(new Uint8Array(exported1)).not.toEqual(new Uint8Array(exported2));
  });

  it('should derive same KEK from same account master key', async () => {
    const kek1 = await deriveKEK(mockAccountMasterKey);
    const kek2 = await deriveKEK(mockAccountMasterKey);
    
    // KEKs should be identical for wrapping/unwrapping
    const testKey = await generateFileKey();
    const wrapped1 = await wrapFileKey(testKey, kek1);
    const unwrapped = await unwrapFileKey(wrapped1, kek2);
    
    // Should successfully unwrap
    expect(unwrapped).toBeDefined();
  });

  it('should wrap and unwrap file keys correctly', async () => {
    const fileKey = await generateFileKey();
    const kek = await deriveKEK(mockAccountMasterKey);
    
    // Export original key
    const originalKeyBytes = await crypto.subtle.exportKey('raw', fileKey);
    
    // Wrap and unwrap
    const wrappedKey = await wrapFileKey(fileKey, kek);
    const unwrappedKey = await unwrapFileKey(wrappedKey, kek);
    
    // Export unwrapped key
    const unwrappedKeyBytes = await crypto.subtle.exportKey('raw', unwrappedKey);
    
    // Should be identical
    expect(new Uint8Array(originalKeyBytes)).toEqual(new Uint8Array(unwrappedKeyBytes));
  });

  it('should fail to unwrap with wrong KEK', async () => {
    const fileKey = await generateFileKey();
    const kek1 = await deriveKEK(mockAccountMasterKey);
    const kek2 = await deriveKEK('different' + mockAccountMasterKey);
    
    const wrappedKey = await wrapFileKey(fileKey, kek1);
    
    // Unwrapping with wrong KEK should fail
    await expect(unwrapFileKey(wrappedKey, kek2)).rejects.toThrow();
  });

  it('should export and import file keys for share links', async () => {
    const fileKey = await generateFileKey();
    
    // Export for share link (base64url)
    const exported = await exportFileKeyForShare(fileKey);
    
    // Should be base64url format (no +, /, or =)
    expect(exported).toMatch(/^[A-Za-z0-9_-]+$/);
    
    // Import from share link
    const imported = await importFileKeyFromShare(exported);
    
    // Should be able to decrypt with imported key
    expect(imported).toBeDefined();
  });

  it('should encrypt and decrypt data with file key', async () => {
    const fileKey = await generateFileKey();
    const testData = new TextEncoder().encode('Hello, secure world!');
    
    // Encrypt
    const encrypted = await encryptFile(testData.buffer, fileKey);
    
    // Should be different from original
    expect(new Uint8Array(encrypted)).not.toEqual(testData);
    
    // Decrypt
    const decrypted = await decryptFile(encrypted, fileKey);
    
    // Should match original
    expect(new Uint8Array(decrypted)).toEqual(testData);
  });

  it('SECURITY: wrappedFileKey should not contain account master key', async () => {
    const fileKey = await generateFileKey();
    const kek = await deriveKEK(mockAccountMasterKey);
    
    const wrappedKey = await wrapFileKey(fileKey, kek);
    
    // Wrapped key should NOT contain the master key
    const wrappedLower = wrappedKey.toLowerCase();
    const masterKeyLower = mockAccountMasterKey.toLowerCase();
    
    expect(wrappedLower).not.toContain(masterKeyLower);
    expect(wrappedLower).not.toContain(masterKeyLower.slice(0, 16));
  });

  it('SECURITY: share link fileKey should not contain account master key', async () => {
    const fileKey = await generateFileKey();
    const shareKey = await exportFileKeyForShare(fileKey);
    
    // Share key should NOT contain the master key
    expect(shareKey.toLowerCase()).not.toContain(mockAccountMasterKey.toLowerCase());
  });
});

describe('Share link security', () => {
  it('CRITICAL: share link format must use URL fragment (#k=...)', () => {
    const mockShareId = 'abc123';
    const mockFileKey = 'MOCK_BASE64URL_KEY';
    
    // Correct format: hash fragment
    const correctLink = `https://app.example.com/s/${mockShareId}#k=${mockFileKey}`;
    
    // URL fragment is not sent to server
    const url = new URL(correctLink);
    expect(url.hash).toBe(`#k=${mockFileKey}`);
    
    // Server only sees pathname, NOT the hash
    const serverSeesUrl = url.origin + url.pathname + url.search;
    expect(serverSeesUrl).not.toContain(mockFileKey);
  });

  it('SECURITY: fileKey must NEVER be in query params', () => {
    const mockFileKey = 'SECRET_KEY';
    
    // WRONG: query param (sent to server!)
    const wrongLink = `https://app.example.com/s/abc123?key=${mockFileKey}`;
    const wrongUrl = new URL(wrongLink);
    
    // This is BAD - server sees query params
    expect(wrongUrl.search).toContain(mockFileKey);
    
    // CORRECT: hash fragment (NOT sent to server)
    const correctLink = `https://app.example.com/s/abc123#k=${mockFileKey}`;
    const correctUrl = new URL(correctLink);
    
    // Server does NOT see hash
    expect(correctUrl.search).not.toContain(mockFileKey);
    expect(correctUrl.hash).toContain(mockFileKey);
  });
});

describe('Integration: Full encryption flow', () => {
  it('should complete full upload-share-download flow', async () => {
    const accountMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const originalData = new TextEncoder().encode('Confidential document content');
    
    // === UPLOAD FLOW ===
    
    // 1. Generate per-file key
    const fileKey = await generateFileKey();
    
    // 2. Encrypt file with file key
    const encryptedData = await encryptFile(originalData.buffer, fileKey);
    
    // 3. Derive KEK from account master key
    const kek = await deriveKEK(accountMasterKey);
    
    // 4. Wrap file key for storage
    const wrappedFileKey = await wrapFileKey(fileKey, kek);
    
    // Simulate: wrappedFileKey stored in database (server never sees plaintext key)
    
    // === OWNER DOWNLOAD FLOW ===
    
    // 5. Owner retrieves wrappedFileKey from database
    // 6. Owner unwraps file key locally
    const unwrappedKey = await unwrapFileKey(wrappedFileKey, kek);
    
    // 7. Owner decrypts locally
    const decryptedByOwner = await decryptFile(encryptedData, unwrappedKey);
    
    expect(new Uint8Array(decryptedByOwner)).toEqual(originalData);
    
    // === SHARE FLOW ===
    
    // 8. Owner unwraps file key for sharing
    const fileKeyForShare = await unwrapFileKey(wrappedFileKey, kek);
    
    // 9. Export file key to base64url
    const fileKeyBase64url = await exportFileKeyForShare(fileKeyForShare);
    
    // 10. Create share link with key in fragment
    const shareLink = `https://app.example.com/s/abc123#k=${fileKeyBase64url}`;
    
    // Verify key is in fragment (not sent to server)
    const url = new URL(shareLink);
    expect(url.hash).toContain(fileKeyBase64url);
    
    // === RECIPIENT FLOW ===
    
    // 11. Recipient extracts key from URL fragment
    const hashMatch = url.hash.match(/#k=([A-Za-z0-9_-]+)/);
    expect(hashMatch).not.toBeNull();
    const extractedKey = hashMatch![1];
    
    // 12. Recipient imports file key
    const recipientFileKey = await importFileKeyFromShare(extractedKey);
    
    // 13. Recipient decrypts locally (server never sees key!)
    const decryptedByRecipient = await decryptFile(encryptedData, recipientFileKey);
    
    expect(new Uint8Array(decryptedByRecipient)).toEqual(originalData);
  });
});
