import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DownloadSection from '../../../components/DownloadSection';
import { AuthProvider, useAuth } from '../../../auth/AuthContext';
import { mockFetchResponse, createMockBlob } from '../../utils/testHelpers';
import { setupUser } from '../../utils/userEventHelper';
import * as decryptModule from '../../../services/decryptWalrusBlob';

// Small helper to set private key synchronously in tests
import { useLayoutEffect } from 'react';

function SetKey({ privKey }: { privKey: string }) {
  const { setPrivateKey } = useAuth();
  useLayoutEffect(() => {
    setPrivateKey(privKey);
  }, [privKey, setPrivateKey]);
  return null;
}

const renderWithKey = (key?: string) =>
  render(
    <AuthProvider>
      {key ? <SetKey privKey={key} /> : null}
      <DownloadSection />
    </AuthProvider>
  );

describe('DownloadSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default no-op fetch
    global.fetch = vi.fn(() => mockFetchResponse({}, true)) as any;
  });

  it('renders inputs and buttons (raw only when not authed)', () => {
    renderWithKey();

    expect(screen.getByPlaceholderText(/Blob ID/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Optional filename/i)).toBeInTheDocument();
    // Raw download button present
    expect(screen.getByRole('button', { name: /download raw/i })).toBeInTheDocument();
    // Decrypted button not present when no key
    expect(screen.queryByRole('button', { name: /download \(decrypted\)/i })).toBeNull();
  });

  it('downloads raw blob and shows status', async () => {
    const blob = createMockBlob(10);
    // Mock fetch to return a Response-like object with blob()
    (global.fetch as any).mockImplementation(() =>
      Promise.resolve({ ok: true, blob: async () => blob })
    );

    renderWithKey();
    const user = setupUser();

    // Spy anchor click
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // Ensure createObjectURL exists in this environment and stub it
    if (typeof (URL as any).createObjectURL === 'undefined') {
      Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob://test', configurable: true });
    }
    if (typeof (URL as any).revokeObjectURL === 'undefined') {
      Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
    }
    const urlSpy = vi.spyOn(URL as any, 'createObjectURL').mockReturnValue('blob://test');

    const input = screen.getByPlaceholderText(/Blob ID/i);
    await user.type(input, 'Aa1Bb2');
    const btn = screen.getByRole('button', { name: /download raw/i });
    await user.click(btn);

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(screen.getByText(/Downloaded raw WALRUS blob/i)).toBeInTheDocument();

    clickSpy.mockRestore();
    urlSpy.mockRestore();
  });

  it('shows error when blobId is empty for raw download', async () => {
    renderWithKey();
    const user = setupUser();

    const btn = screen.getByRole('button', { name: /download raw/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/Enter a blob ID to download/i)).toBeInTheDocument();
    });
  });

  it('downloads and decrypts when key present', async () => {
    const blob = createMockBlob(20);
    (global.fetch as any).mockImplementation(() => Promise.resolve({ ok: true, blob: async () => blob }));

  // Mock decrypt service
  const decryptSpy = vi.spyOn(decryptModule, 'decryptWalrusBlob').mockResolvedValue({ blob: createMockBlob(5), suggestedName: 'file.txt' } as any);

    renderWithKey('0x' + 'a'.repeat(64));
    const user = setupUser();

    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    if (typeof (URL as any).createObjectURL === 'undefined') {
      Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob://dec', configurable: true });
    }
    if (typeof (URL as any).revokeObjectURL === 'undefined') {
      Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, configurable: true });
    }
    const urlSpy = vi.spyOn(URL as any, 'createObjectURL').mockReturnValue('blob://dec');

    await user.type(screen.getByPlaceholderText(/Blob ID/i), 'Aa1');
    const decBtn = screen.getByRole('button', { name: /download \(decrypted\)/i });
    await user.click(decBtn);

    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(screen.getByText(/Decrypted & downloaded as file.txt/i)).toBeInTheDocument();

    clickSpy.mockRestore();
    urlSpy.mockRestore();
    decryptSpy.mockRestore();
  });

  it('shows server error when download fails', async () => {
    (global.fetch as any).mockImplementation(() => Promise.resolve({ ok: false, json: async () => ({ error: 'Not found' }) }));

    renderWithKey();
    const user = setupUser();

    await user.type(screen.getByPlaceholderText(/Blob ID/i), 'missing');
    const btn = screen.getByRole('button', { name: /download raw/i });
    await user.click(btn);

    await waitFor(() => {
      expect(screen.getByText(/Not found/i)).toBeInTheDocument();
    });
  });
});
