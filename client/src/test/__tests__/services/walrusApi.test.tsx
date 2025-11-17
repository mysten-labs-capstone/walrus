import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyFile, uploadBlob, downloadBlob } from '../../../services/walrusApi';
import { createMockFile, mockFetchResponse } from '../../utils/testHelpers';
import {
  MOCK_PRIVATE_KEY,
  MOCK_BLOB_ID,
  MOCK_VERIFY_RESPONSE,
  MOCK_UPLOAD_RESPONSE,
} from '../../utils/mockData';

describe('walrusApi service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('verifyFile', () => {
    it('should verify valid file', async () => {
      (global.fetch as any).mockResolvedValue(
        mockFetchResponse(MOCK_VERIFY_RESPONSE)
      );

      const file = createMockFile('test.txt', 1024);
      const result = await verifyFile(file, MOCK_PRIVATE_KEY);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/verify'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should return validation errors', async () => {
      const errorResponse = {
        isValid: false,
        errors: ['File too large'],
        warnings: [],
        fileInfo: { name: 'test.txt', size: 1024, type: 'text/plain' },
      };

      (global.fetch as any).mockResolvedValue(mockFetchResponse(errorResponse));

      const file = createMockFile('test.txt', 1024);
      const result = await verifyFile(file, MOCK_PRIVATE_KEY);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File too large');
    });
  });

  describe('uploadBlob', () => {
    it('should upload blob successfully', async () => {
      // Mock XMLHttpRequest
      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        upload: { onprogress: null },
        onreadystatechange: null,
        readyState: 4,
        status: 200,
        responseText: JSON.stringify(MOCK_UPLOAD_RESPONSE),
      };

      global.XMLHttpRequest = vi.fn(() => mockXHR) as any;

      const blob = new Blob(['test']);
      const promise = uploadBlob(blob, MOCK_PRIVATE_KEY);

      // Simulate successful response
      mockXHR.onreadystatechange?.();

      const result = await promise;
      expect(result.blobId).toBe(MOCK_BLOB_ID);
    });

    it('should track upload progress', async () => {
      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(),
        upload: { onprogress: null },
        onreadystatechange: null,
        readyState: 4,
        status: 200,
        responseText: JSON.stringify(MOCK_UPLOAD_RESPONSE),
      };

      global.XMLHttpRequest = vi.fn(() => mockXHR) as any;

      const onProgress = vi.fn();
      const blob = new Blob(['test']);
      const promise = uploadBlob(blob, MOCK_PRIVATE_KEY, onProgress);

      // Simulate progress event
      mockXHR.upload.onprogress?.({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);

      expect(onProgress).toHaveBeenCalledWith(50);

      mockXHR.onreadystatechange?.();
      await promise;
    });

    it('should handle upload errors', async () => {
      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(),
        upload: { onprogress: null },
        onreadystatechange: null,
        readyState: 4,
        status: 500,
        responseText: JSON.stringify({ error: 'Server error' }),
      };

      global.XMLHttpRequest = vi.fn(() => mockXHR) as any;

      const blob = new Blob(['test']);
      const promise = uploadBlob(blob, MOCK_PRIVATE_KEY);

      mockXHR.onreadystatechange?.();

      await expect(promise).rejects.toThrow();
    });
  });

  describe('downloadBlob', () => {
    it('should download blob', async () => {
      const mockBlob = new Blob(['test content']);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        blob: async () => mockBlob,
      });

      const result = await downloadBlob(MOCK_BLOB_ID, MOCK_PRIVATE_KEY);

      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/download'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(MOCK_BLOB_ID),
        })
      );
    });

    it('should include optional filename', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        blob: async () => new Blob(['test']),
      });

      await downloadBlob(MOCK_BLOB_ID, MOCK_PRIVATE_KEY, 'custom.txt');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('custom.txt'),
        })
      );
    });
  });
});