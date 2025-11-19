// Normalizes importing @testing-library/user-event across different bundlers
// and versions. Returns the result of calling `setup()` on the library.
import * as UE from '@testing-library/user-event';

export function setupUser() {
  const u: any = UE;
  // v14+ and some ESM builds export setup directly
  if (typeof u.setup === 'function') return u.setup();
  // Some bundlers export a default with setup
  if (u.default && typeof u.default.setup === 'function') return u.default.setup();

  // If the module (or its default) already exposes the user-event helpers
  // directly (click/type/upload/etc.), return that object so tests can use
  // the same API as the `setup()` result.
  const candidate = u.default || u;
  if (
    candidate &&
    (typeof candidate.click === 'function' || typeof candidate.type === 'function')
  ) {
    return candidate;
  }

  // As a last resort, try calling the module if it's a function
  if (typeof u === 'function') return u();

  throw new Error('Could not find user-event setup function');
}
