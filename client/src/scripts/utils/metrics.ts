import { apiPost } from '../../lib/http';

export async function logMetric(payload: any) {
  try {
    await apiPost('/api/metrics', payload);
  } catch {}
}

export async function timed<T>(
  kind: 'upload'|'download',
  fn: () => Promise<T>,
  extra: any = {}
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    const t1 = performance.now();
    await logMetric({ kind, durationMs: t1 - t0, ts: Date.now(), extra });
    return result;
  } catch (e) {
    const t1 = performance.now();
    await logMetric({ kind, durationMs: t1 - t0, ts: Date.now(), error: String(e), extra });
    throw e;
  }
}
