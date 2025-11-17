import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupUser } from '../../utils/userEventHelper';
import UploadSection from '../../../components/UploadSection';
import { AuthProvider, useAuth } from '../../../auth/AuthContext';
import { useLayoutEffect } from 'react';
import { createMockFile, mockFetchResponse } from '../../utils/testHelpers';
import { MOCK_VERIFY_RESPONSE, MOCK_UPLOAD_RESPONSE } from '../../utils/mockData';

const mockOnUploaded = vi.fn();

function SetKey({ privKey }: { privKey: string }) {
  const { setPrivateKey } = useAuth();
  // useLayoutEffect ensures the key is set before paint so tests that
  // immediately interact with the UI see the authenticated state.
  useLayoutEffect(() => {
    setPrivateKey(privKey);
  }, [privKey, setPrivateKey]);
  return null;
}

const renderUploadSection = (key = 'test-private-key') => {
  return render(
    <AuthProvider>
      <SetKey privKey={key} />
      <UploadSection onUploaded={mockOnUploaded} />
    </AuthProvider>
  );
};

describe('UploadSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should render upload section', () => {
    renderUploadSection();
    
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByLabelText(/encrypt/i)).toBeInTheDocument();
  });

  it('should allow toggling encryption', async () => {
    renderUploadSection();
  const user = setupUser();
    
    const checkbox = screen.getByLabelText(/encrypt/i) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await user.click(checkbox);
    expect(checkbox.checked).toBe(false);

    await user.click(checkbox);
    expect(checkbox.checked).toBe(true);
  });

  it('should handle file selection', async () => {
    renderUploadSection();
  const user = setupUser();
    
    const file = createMockFile('test.txt', 1024);
    const input = screen.getByRole('heading', { name: /upload/i })
      .closest('section')
      ?.querySelector('input[type="file"]') as HTMLInputElement;

  // Ensure the input is enabled for the test (AuthProvider should set a key,
  // but to avoid timing issues we force-enable the input here)
  input.disabled = false;
  await user.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });
  });

  it('should show upload progress', async () => {
    renderUploadSection();
  const user = setupUser();

    // Mock successful verification and upload
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/verify')) {
        return mockFetchResponse(MOCK_VERIFY_RESPONSE);
      }
      if (url.includes('/api/upload')) {
        return mockFetchResponse(MOCK_UPLOAD_RESPONSE);
      }
      return mockFetchResponse({});
    });

    // Mock XMLHttpRequest so uploadBlob (which uses XHR) can report progress
    const mockXHR: any = {
      open: vi.fn(),
      send: vi.fn(),
      upload: { onprogress: null as any },
      onreadystatechange: null as any,
      readyState: 4,
      status: 200,
      responseText: JSON.stringify(MOCK_UPLOAD_RESPONSE),
    };
    global.XMLHttpRequest = vi.fn(() => mockXHR) as any;

    const file = createMockFile('test.txt', 1024);
    const input = screen.getByRole('heading', { name: /upload/i })
      .closest('section')
      ?.querySelector('input[type="file"]') as HTMLInputElement;

  // Ensure input is enabled for the test
  input.disabled = false;
  await user.upload(input, file);

    // Click "Upload Now" button
    const uploadButton = await screen.findByRole('button', { name: /upload now/i });
    await user.click(uploadButton);

    // Simulate progress events and final ready state
    // Some environments set these handlers synchronously; ensure we call them
    if (typeof mockXHR.upload.onprogress === 'function') {
      mockXHR.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
    }
    if (typeof mockXHR.onreadystatechange === 'function') {
      mockXHR.onreadystatechange();
    }

    // Should show progress
    await waitFor(() => {
      expect(screen.getByText(/uploading|verifying|encrypting/i)).toBeInTheDocument();
    });
  });

  it('should show error on upload failure', async () => {
    renderUploadSection();
  const user = setupUser();

    // Mock failed verification
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/verify')) {
        return mockFetchResponse(
          {
            isValid: false,
            errors: ['File too large'],
            warnings: [],
            fileInfo: { name: 'test.txt', size: 1024, type: 'text/plain' },
          },
          true
        );
      }
      return mockFetchResponse({});
    });

    // Also mock XHR in case upload is invoked; not strictly necessary for
    // validation failures, but keeps the environment consistent.
    const mockXHRErr: any = {
      open: vi.fn(),
      send: vi.fn(),
      upload: { onprogress: null as any },
      onreadystatechange: null as any,
      readyState: 4,
      status: 400,
      responseText: JSON.stringify({ error: 'Upload failed' }),
    };
    global.XMLHttpRequest = vi.fn(() => mockXHRErr) as any;

    const file = createMockFile('test.txt', 1024);
    const input = screen.getByRole('heading', { name: /upload/i })
      .closest('section')
      ?.querySelector('input[type="file"]') as HTMLInputElement;

  // Ensure input is enabled for the test
  input.disabled = false;
  await user.upload(input, file);

  const uploadButton = await screen.findByRole('button', { name: /upload now/i });
  await user.click(uploadButton);

    // Wait for error text to appear (validation should short-circuit upload)
    const matches = await screen.findAllByText(/file too large/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});