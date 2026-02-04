/**
 * Security validation tests for HKDF-based encryption system
 * 
 * Critical security requirements:
 * 1. All decryption info embedded in blob - NO database dependency
 * 2. Each file gets unique encryption via random fileId and IV
 * 3. File key derived deterministically from master key + fileId
 * 4. Works completely offline - smart contract compatible
 * 5. Share URLs embed file key in fragment (#k=...), never in query params
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { encryptFile, decryptFile, decryptWithSharedKey, exportFileKeyForShare } from '../../services/crypto';

describe('HKDF-based File Encryption', () => {
  const mockMasterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  let testFile: File;

  beforeEach(() => {
    testFile = new File(['Hello, secure world!'], 'test.txt', { type: 'text/plain' });
  });

  it('should encrypt and decrypt a file correctly', async () => {
    // Encrypt
    const encryptedBlob = await encryptFile(testFile, mockMasterKey);
    
    // Encrypted blob should be larger (has fileId + IV + ciphertext)
    expect(encryptedBlob.size).toBeGreaterThan(testFile.size);
    
    // Decrypt
    const result = await decryptFile(encryptedBlob, mockMasterKey, 'test.txt');
    
    expect(result).not.toBeNull();
    expect(result!.suggestedName).toBe('test.txt');
    
    // Verify decrypted content matches original
    const decryptedText = await result!.blob.text();
    expect(decryptedText).toBe('Hello, secure world!');
  });

  it('should fail decryption with wrong master key', async () => {
    const encryptedBlob = await encryptFile(testFile, mockMasterKey);
    
    const wrongKey = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    const result = await decryptFile(encryptedBlob, wrongKey, 'test.txt');
    
    // Decryption should fail
    expect(result).toBeNull();
  });

  it('should produce unique ciphertext for same file encrypted twice', async () => {
    const encrypted1 = await encryptFile(testFile, mockMasterKey);
    const encrypted2 = await encryptFile(testFile, mockMasterKey);
    
    // Same plaintext, same key, but different ciphertext due to random fileId and IV
    const bytes1 = new Uint8Array(await encrypted1.arrayBuffer());
    const bytes2 = new Uint8Array(await encrypted2.arrayBuffer());
    
    expect(bytes1).not.toEqual(bytes2);
  });

  it('should have correct blob structure: [fileId(32)][IV(12)][ciphertext]', async () => {
    const encryptedBlob = await encryptFile(testFile, mockMasterKey);
    const bytes = new Uint8Array(await encryptedBlob.arrayBuffer());
    
    // Minimum size check: 32 (fileId) + 12 (IV) + 16 (GCM tag minimum)
    expect(bytes.length).toBeGreaterThanOrEqual(60);
    
    // FileId should be 32 bytes of randomness (not all zeros)
    const fileId = bytes.slice(0, 32);
    const allZeros = fileId.every(b => b === 0);
    expect(allZeros).toBe(false);
    
    // IV should be 12 bytes
    const iv = bytes.slice(32, 44);
    expect(iv.length).toBe(12);
  });

  it('should work completely offline without database access', async () => {
    // This test verifies the core benefit: offline decryption
    
    // Encrypt a file
    const encryptedBlob = await encryptFile(testFile, mockMasterKey);
    
    // Simulate offline scenario: only have the blob and master key
    // No database, no server, no network - just decrypt
    const result = await decryptFile(encryptedBlob, mockMasterKey, 'offline-test.txt');
    
    expect(result).not.toBeNull();
    const decryptedText = await result!.blob.text();
    expect(decryptedText).toBe('Hello, secure world!');
  });

  it('should export file key for sharing', async () => {
    const encryptedBlob = await encryptFile(testFile, mockMasterKey);
    
    // Export the file key
    const fileKeyBase64url = await exportFileKeyForShare(encryptedBlob, mockMasterKey);
    
    // Should be base64url format (no +, /, or =)
    expect(fileKeyBase64url).toMatch(/^[A-Za-z0-9_-]+$/);
    
    // Should be able to decrypt with this key
    const result = await decryptWithSharedKey(encryptedBlob, fileKeyBase64url, 'shared.txt');
    
    expect(result).not.toBeNull();
    const decryptedText = await result!.blob.text();
    expect(decryptedText).toBe('Hello, secure world!');
  });

  it('should decrypt shared file without master key', async () => {
    // Encrypt with master key
    const encryptedBlob = await encryptFile(testFile, mockMasterKey);
    
    // Export file key
    const fileKeyBase64url = await exportFileKeyForShare(encryptedBlob, mockMasterKey);
    
    // Share recipient can decrypt WITHOUT knowing the master key
    // They only need the blob and the file key from URL fragment
    const result = await decryptWithSharedKey(encryptedBlob, fileKeyBase64url, 'shared.txt');
    
    expect(result).not.toBeNull();
    const decryptedText = await result!.blob.text();
    expect(decryptedText).toBe('Hello, secure world!');
  });
});

describe('Share Link Security', () => {
  it('CRITICAL: file key must be in URL fragment (#k=...), not query params', () => {
    const mockShareId = 'abc123';
    const mockFileKey = 'MOCK_BASE64URL_KEY';
    
    // Correct format: hash fragment
    const correctLink = `https://app.example.com/s/${mockShareId}#k=${mockFileKey}`;
    
    // URL fragment is NOT sent to server
    const url = new URL(correctLink);
    expect(url.hash).toBe(`#k=${mockFileKey}`);
    
    // Server only sees pathname, NOT the hash
    const serverSeesUrl = url.origin + url.pathname + url.search;
    expect(serverSeesUrl).not.toContain(mockFileKey);
    expect(serverSeesUrl).toBe(`https://app.example.com/s/${mockShareId}`);
  });

  it('SECURITY: file key must NEVER be in query params', () => {
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

describe('Integration: Full Encryption Flow', () => {
  it('should complete full upload-share-download flow', async () => {
    const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const originalFile = new File(['Confidential document content'], 'secret.txt', { type: 'text/plain' });
    
    // === UPLOAD FLOW ===
    
    // 1. User encrypts file with master key
    const encryptedBlob = await encryptFile(originalFile, masterKey);
    
    // 2. Upload encrypted blob to Walrus (simulated)
    const walrusBlobId = 'simulated-blob-id-123';
    
    // 3. Save metadata to database (only blobId and encrypted=true)
    const metadata = {
      blobId: walrusBlobId,
      filename: 'secret.txt',
      encrypted: true, // No wrappedFileKey needed!
    };
    
    // === OWNER DOWNLOAD FLOW ===
    
    // 4. Owner downloads encrypted blob from Walrus
    // (In real app: fetch from Walrus using blobId)
    
    // 5. Owner decrypts with master key - no database lookup needed!
    const ownerResult = await decryptFile(encryptedBlob, masterKey, 'secret.txt');
    
    expect(ownerResult).not.toBeNull();
    const ownerText = await ownerResult!.blob.text();
    expect(ownerText).toBe('Confidential document content');
    
    // === SHARE FLOW ===
    
    // 6. Owner exports file key for sharing
    const shareFileKey = await exportFileKeyForShare(encryptedBlob, masterKey);
    
    // 7. Create share link with key in fragment
    const shareLink = `https://app.example.com/s/share123#k=${shareFileKey}`;
    
    // 8. Recipient extracts key from URL fragment
    const url = new URL(shareLink);
    const keyFromUrl = url.hash.replace('#k=', '');
    
    // 9. Recipient decrypts with file key (no master key needed)
    const recipientResult = await decryptWithSharedKey(encryptedBlob, keyFromUrl, 'secret.txt');
    
    expect(recipientResult).not.toBeNull();
    const recipientText = await recipientResult!.blob.text();
    expect(recipientText).toBe('Confidential document content');
  });

  it('should work in disaster recovery scenario', async () => {
    const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const importantFile = new File(['Critical business data'], 'backup.txt', { type: 'text/plain' });
    
    // Encrypt and upload to Walrus
    const encryptedBlob = await encryptFile(importantFile, masterKey);
    
    // DISASTER: Database crashed, server down, everything offline
    // User only has:
    // 1. The encrypted blob from Walrus decentralized storage
    // 2. Their 12-word seed phrase (derives to masterKey)
    
    // They can STILL decrypt!
    const recovered = await decryptFile(encryptedBlob, masterKey, 'backup.txt');
    
    expect(recovered).not.toBeNull();
    const recoveredText = await recovered!.blob.text();
    expect(recoveredText).toBe('Critical business data');
    
    // This works with:
    // - Command-line tools
    // - Smart contracts
    // - Offline utilities
    // - No database required!
  });
});

describe('Cryptographic Properties', () => {
  it('should use different file keys for different files', async () => {
    const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const file1 = new File(['File 1'], 'file1.txt', { type: 'text/plain' });
    const file2 = new File(['File 2'], 'file2.txt', { type: 'text/plain' });
    
    const encrypted1 = await encryptFile(file1, masterKey);
    const encrypted2 = await encryptFile(file2, masterKey);
    
    // Extract fileIds (first 32 bytes)
    const bytes1 = new Uint8Array(await encrypted1.arrayBuffer());
    const bytes2 = new Uint8Array(await encrypted2.arrayBuffer());
    
    const fileId1 = bytes1.slice(0, 32);
    const fileId2 = bytes2.slice(0, 32);
    
    // Different files should have different fileIds
    expect(fileId1).not.toEqual(fileId2);
  });

  it('should maintain security isolation between files', async () => {
    const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const file1 = new File(['Secret 1'], 'secret1.txt', { type: 'text/plain' });
    const file2 = new File(['Secret 2'], 'secret2.txt', { type: 'text/plain' });
    
    const encrypted1 = await encryptFile(file1, masterKey);
    const encrypted2 = await encryptFile(file2, masterKey);
    
    // Get file key for file1
    const key1 = await exportFileKeyForShare(encrypted1, masterKey);
    
    // Try to use file1's key to decrypt file2
    const wrongDecrypt = await decryptWithSharedKey(encrypted2, key1, 'test.txt');
    
    // Should fail - file keys are file-specific
    expect(wrongDecrypt).toBeNull();
  });
});
