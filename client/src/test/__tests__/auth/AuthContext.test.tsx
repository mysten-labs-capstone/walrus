import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../../auth/AuthContext';
import { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('AuthContext', () => {
  it('should start with no authentication', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.privateKey).toBe('');
  });

  it('should set private key', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const testKey = '0x' + 'a'.repeat(64);

    act(() => {
      result.current.setPrivateKey(testKey);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.privateKey).toBe(testKey);
  });

  it('should clear private key', () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    const testKey = '0x' + 'a'.repeat(64);

    act(() => {
      result.current.setPrivateKey(testKey);
    });

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.clearPrivateKey();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.privateKey).toBe('');
  });

  it('should throw error when used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = vi.fn();

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within <AuthProvider>');

    console.error = originalError;
  });
});