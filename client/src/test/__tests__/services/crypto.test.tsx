import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encryptToBlob } from '../../../services/crypto';
import { createMockFile } from '../../utils/testHelpers';
import { MOCK_PRIVATE_KEY } from '../../utils/mockData';

describe('crypto service', () => {
  beforeEach(() => {
    // Mock Web Crypto API
    global.crypto.subtle.importKey = vi.fn().mockResolvedValue({});
    global.crypto.subtle.deriveKey = vi.fn().mockResolvedValue({});
    global.crypto.subtle.encrypt = vi.fn().mockResolvedValue(
      new Uint8Array([1, 2, 3, 4, 5]).buffer
    );
  });

  describe('encryptToBlob', () => {
    it('should encrypt file to blob', async () => {
      const file = createMockFile('test.txt', 100);
      const result = await encryptToBlob(file, MOCK_PRIVATE_KEY);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('application/octet-stream');
    });

    it('should include magic bytes in output', async () => {
      const file = createMockFile('test.txt', 100);
      const blob = await encryptToBlob(file, MOCK_PRIVATE_KEY);
      
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Check for WALRUS1 magic bytes
  const magic = new TextEncoder().encode('WALRUS1');
  // Compare as plain arrays to avoid subtle typed-array/Buffer equality issues
  expect(Array.from(bytes.slice(0, magic.length))).toEqual(Array.from(magic));
    });

    it('should handle different file sizes', async () => {
      const sizes = [1, 100, 1024, 10240];

      for (const size of sizes) {
        const file = createMockFile('test.txt', size);
        const result = await encryptToBlob(file, MOCK_PRIVATE_KEY);
        
        expect(result).toBeInstanceOf(Blob);
        expect(result.size).toBeGreaterThan(0);
      }
    });

    it('should preserve file extension in metadata', async () => {
      const file = createMockFile('document.pdf', 100, 'application/pdf');
      const blob = await encryptToBlob(file, MOCK_PRIVATE_KEY);
      
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      
      // Extract header to check extension
      const magic = new TextEncoder().encode('WALRUS1');
      const headerLen = new DataView(bytes.buffer).getUint32(magic.length, false);
      const headerStart = magic.length + 4;
      const headerBytes = bytes.slice(headerStart, headerStart + headerLen);
      const header = JSON.parse(new TextDecoder().decode(headerBytes));
      
      expect(header.ext).toBe('pdf');
    });

    it('should throw error for invalid private key', async () => {
      const file = createMockFile('test.txt', 100);
      
      await expect(
        encryptToBlob(file, 'invalid-key')
      ).rejects.toThrow();
    });
  });
});