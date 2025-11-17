import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { AuthProvider } from '../../auth/AuthContext';

// Custom render with providers
export function renderWithAuth(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    ...options,
  });
}

// Mock file helper
export function createMockFile(
  name: string,
  size: number,
  type: string = 'text/plain'
): File {
  const content = new Array(size).fill('a').join('');
  return new File([content], name, { type });
}

// Mock blob helper
export function createMockBlob(size: number): Blob {
  const content = new Uint8Array(size);
  return new Blob([content]);
}

// Wait for async operations
export const waitFor = (ms: number) => 
  new Promise(resolve => setTimeout(resolve, ms));

// Mock fetch response helper
export function mockFetchResponse(data: any, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 400,
    json: async () => data,
    text: async () => JSON.stringify(data),
    blob: async () => new Blob([JSON.stringify(data)]),
  } as Response);
}