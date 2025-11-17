// Test setup: enable DOM matchers and any global test configuration
import '@testing-library/jest-dom';

// Optionally polyfill fetch if tests need it
if (typeof (globalThis as any).fetch === 'undefined') {
  // lightweight fetch polyfill using node-fetch only when needed
  // (node >=18 has global fetch; Vitest/jsdom may not)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeFetch = require('node-fetch');
    (globalThis as any).fetch = nodeFetch;
  } catch (err) {
    // ignore; tests that need fetch should install a polyfill
  }
}

// Many components use `idb-keyval` which expects `indexedDB` in the environment.
// JSDOM doesn't provide IndexedDB by default, and installing a full polyfill
// is heavier than needed for unit tests. Mock `idb-keyval` here to provide
// an in-memory no-op store for tests so components depending on it won't fail.
try {
  // Vitest exposes `vi` globally when `globals: true` is enabled in config.
  // If `vi` is not present on globalThis, import it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { vi } = require('vitest');

  vi.mock('idb-keyval', () => {
    const store = new Map();
    return {
      get: async (key: any) => store.get(String(key)),
      set: async (key: any, value: any) => { store.set(String(key), value); },
      del: async (key: any) => { store.delete(String(key)); },
      clear: async () => { store.clear(); },
      keys: async () => Array.from(store.keys()),
      entries: async () => Array.from(store.entries()),
      createStore: (_dbName?: string, _storeName?: string) => ({ dbName: 'test', storeName: 'test' }),
    };
  });
} catch (err) {
  // If mocking fails, tests may still run in environments where vi isn't available
}

// Ensure XMLHttpRequest.DONE constant exists for tests that mock XHR instances.
// Some test suites mock `XMLHttpRequest` with plain objects; they rely on the
// constructor having the numeric DONE constant (value 4). jsdom/node doesn't
// always provide it on the mocked constructor, so define a safe default.
try {
  const g: any = globalThis as any;
  if (typeof g.XMLHttpRequest === 'undefined') {
    // leave undefined — tests that need XHR will mock it explicitly
  } else if (typeof g.XMLHttpRequest === 'function' || typeof g.XMLHttpRequest === 'object') {
    if (typeof g.XMLHttpRequest.DONE === 'undefined') {
      g.XMLHttpRequest.DONE = 4;
    }
  }
} catch (err) {
  // ignore
}

// Polyfill File.prototype.arrayBuffer for environments where File doesn't
// implement it (some jsdom/node versions). Prefer Blob.arrayBuffer if
// available, otherwise fall back to FileReader if present.
try {
  if (typeof (globalThis as any).File !== 'undefined') {
    const F: any = (globalThis as any).File;
    if (typeof F.prototype.arrayBuffer !== 'function') {
      if (typeof (globalThis as any).Blob !== 'undefined' && typeof (globalThis as any).Blob.prototype.arrayBuffer === 'function') {
        F.prototype.arrayBuffer = function () {
          return (globalThis as any).Blob.prototype.arrayBuffer.call(this);
        };
      } else if (typeof (globalThis as any).FileReader !== 'undefined') {
        F.prototype.arrayBuffer = function () {
          const file = this;
          return new Promise((resolve, reject) => {
            const fr = new (globalThis as any).FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsArrayBuffer(file);
          });
        };
      }
    }
  }
} catch (err) {
  // ignore polyfill failures in odd environments
}

// Polyfill Blob.prototype.arrayBuffer if missing (some jsdom builds)
try {
  if (typeof (globalThis as any).Blob !== 'undefined') {
    const B: any = (globalThis as any).Blob;
    if (typeof B.prototype.arrayBuffer !== 'function') {
      if (typeof (globalThis as any).FileReader !== 'undefined') {
        B.prototype.arrayBuffer = function () {
          const blob = this;
          return new Promise((resolve, reject) => {
            const fr = new (globalThis as any).FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsArrayBuffer(blob);
          });
        };
      }
    }
  }
} catch (err) {
  // ignore
}

