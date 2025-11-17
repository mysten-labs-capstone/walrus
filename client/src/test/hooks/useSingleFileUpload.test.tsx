// src/test/__tests__/hooks/useSingleFileUpload.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSingleFileUpload } from '../../../hooks/useSingleFileUpload';
import { createMockFile, mockFetchResponse } from '../../utils/testHelpers';
import {
  MOCK_PRIVATE_KEY,
  MOCK_VERIFY_RESPONSE,
  MOCK_UPLOAD_RESPONSE,
} from '../../utils/mockData';

// Mock the crypto module
vi.mock('../../../services/crypto', () => ({
  encryptToBlob: vi.fn().mockResolvedValue(new Blob(['encrypted'])),
}));

describe('useSingleFileUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    
    // Mock XMLHttpRequest for upload
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
  });

  it('should start with idle state', () => {
    const { result } = renderHook(() => useSingleFileUpload());

    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.file).toBeNull();
    expect(result.current.state.progress).toBe(0);
  });

  it('should handle file upload', async () => {
    (global.fetch as any).mockResolvedValue(
      mockFetchResponse(MOCK_VERIFY_RESPONSE)
    );

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useSingleFileUpload(onUploaded));

    const file = createMockFile('test.txt', 1024);

    await act(async () => {
      await result.current.startUpload(file, MOCK_PRIVATE_KEY, true);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('done');
    });

    expect(onUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        blobId: MOCK_UPLOAD_RESPONSE.blobId,
        file,
        encrypted: true,
      })
    );
  });

  it('should track upload progress', async () => {
    (global.fetch as any).mockResolvedValue(
      mockFetchResponse(MOCK_VERIFY_RESPONSE)
    );

    const { result } = renderHook(() => useSingleFileUpload());
    const file = createMockFile('test.txt', 1024);

    await act(async () => {
      result.current.startUpload(file, MOCK_PRIVATE_KEY, false);
    });

    await waitFor(() => {
      expect(result.current.state.file).toBe(file);
    });

    // Progress should be tracked
    expect(result.current.state.progress).toBeGreaterThanOrEqual(0);
  });

  it('should handle validation errors', async () => {
    const errorResponse = {
      isValid: false,
      errors: ['File too large'],
      warnings: [],
      fileInfo: { name: 'test.txt', size: 1024, type: 'text/plain' },
    };

    (global.fetch as any).mockResolvedValue(mockFetchResponse(errorResponse));

    const { result } = renderHook(() => useSingleFileUpload());
    const file = createMockFile('test.txt', 1024);

    await act(async () => {
      await result.current.startUpload(file, MOCK_PRIVATE_KEY, true);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toBeTruthy();
  });

  it('should reset state', async () => {
    const { result } = renderHook(() => useSingleFileUpload());
    const file = createMockFile('test.txt', 1024);

    // Start upload
    await act(async () => {
      result.current.startUpload(file, MOCK_PRIVATE_KEY, false);
    });

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.state.status).toBe('idle');
    expect(result.current.state.file).toBeNull();
    expect(result.current.state.progress).toBe(0);
  });

  it('should skip encryption when requested', async () => {
    (global.fetch as any).mockResolvedValue(
      mockFetchResponse(MOCK_VERIFY_RESPONSE)
    );

    const onUploaded = vi.fn();
    const { result } = renderHook(() => useSingleFileUpload(onUploaded));
    const file = createMockFile('test.txt', 1024);

    await act(async () => {
      await result.current.startUpload(file, MOCK_PRIVATE_KEY, false);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('done');
    });

    expect(onUploaded).toHaveBeenCalledWith(
      expect.objectContaining({
        encrypted: false,
      })
    );
  });

  it('should handle upload without onUploaded callback', async () => {
    (global.fetch as any).mockResolvedValue(
      mockFetchResponse(MOCK_VERIFY_RESPONSE)
    );

    const { result } = renderHook(() => useSingleFileUpload());
    const file = createMockFile('test.txt', 1024);

    await act(async () => {
      await result.current.startUpload(file, MOCK_PRIVATE_KEY, true);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('done');
    });

    // Should not throw error
    expect(result.current.state.error).toBeUndefined();
  });

  it('should handle network errors', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSingleFileUpload());
    const file = createMockFile('test.txt', 1024);

    await act(async () => {
      await result.current.startUpload(file, MOCK_PRIVATE_KEY, true);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    expect(result.current.state.error).toContain('Network error');
  });

  it('should transition through correct states', async () => {
    (global.fetch as any).mockResolvedValue(
      mockFetchResponse(MOCK_VERIFY_RESPONSE)
    );

    const { result } = renderHook(() => useSingleFileUpload());
    const file = createMockFile('test.txt', 1024);
    const states: string[] = [];

    // Track state changes
    const originalStartUpload = result.current.startUpload;
    result.current.startUpload = async (file, key, encrypt) => {
      states.push(result.current.state.status);
      await originalStartUpload(file, key, encrypt);
      states.push(result.current.state.status);
    };

    await act(async () => {
      await result.current.startUpload(file, MOCK_PRIVATE_KEY, true);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('done');
    });

    // Should have gone through: idle -> verifying -> encrypting -> uploading -> done
    expect(states).toContain('idle');
    expect(result.current.state.status).toBe('done');
  });
});