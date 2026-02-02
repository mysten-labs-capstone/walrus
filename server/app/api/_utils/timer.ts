export async function timeIt<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now?.() ?? Date.now();
  const result = await fn();
  const t1 = performance.now?.() ?? Date.now();
  const ms = t1 - t0;
  return { result, ms };
}
