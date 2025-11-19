import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { setupUser } from '../../utils/userEventHelper';
import PrivateKeyGate from '../../../components/PrivateKeyGate';
import { AuthProvider } from '../../../auth/AuthContext';

const renderWithAuth = (ui: React.ReactElement) => {
  return render(<AuthProvider>{ui}</AuthProvider>);
};

describe('PrivateKeyGate', () => {
  it('should render input field', () => {
    renderWithAuth(<PrivateKeyGate />);
    
    expect(screen.getByPlaceholderText('0x...')).toBeInTheDocument();
    expect(screen.getByText(/private key/i)).toBeInTheDocument();
  });

  it('should toggle password visibility', async () => {
    renderWithAuth(<PrivateKeyGate />);
    const user = setupUser();
    
    const input = screen.getByPlaceholderText('0x...') as HTMLInputElement;
    const toggleButton = screen.getByLabelText(/show key|hide key/i);

    expect(input.type).toBe('password');

    await user.click(toggleButton);
    expect(input.type).toBe('text');

    await user.click(toggleButton);
    expect(input.type).toBe('password');
  });

  it('should show error for invalid key', async () => {
    renderWithAuth(<PrivateKeyGate />);
    const user = setupUser();
    
    const input = screen.getByPlaceholderText('0x...');
    const submitButton = screen.getByRole('button', { name: /continue to walrus/i });

    await user.type(input, 'invalid-key');
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/valid 32-byte hex private key/i)).toBeInTheDocument();
    });
  });

  it('should accept valid private key', async () => {
    renderWithAuth(<PrivateKeyGate />);
    const user = setupUser();
    
    const validKey = '0x' + 'a'.repeat(64);
    const input = screen.getByPlaceholderText('0x...');
    const submitButton = screen.getByRole('button', { name: /continue to walrus/i });

    await user.type(input, validKey);
    await user.click(submitButton);

    // After successful submission there should be no validation error and the
    // submit button should return to the default label (not verifying).
    await waitFor(() => {
      expect(screen.queryByText(/valid 32-byte hex private key/i)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /continue to walrus/i })).toBeInTheDocument();
    });
  });

  it('should normalize key without 0x prefix', async () => {
    renderWithAuth(<PrivateKeyGate />);
  const user = setupUser();
    
    const keyWithout0x = 'a'.repeat(64);
    const input = screen.getByPlaceholderText('0x...');
    const submitButton = screen.getByRole('button', { name: /continue to walrus/i });

    await user.type(input, keyWithout0x);
    await user.click(submitButton);

    // Should accept and normalize
    await waitFor(() => {
      expect(screen.queryByText(/valid 32-byte hex private key/i)).not.toBeInTheDocument();
    });
  });
});