import { apiUrl } from "../config/api";

let cachedBalance: number | null = null;
let cachedUserId: string | null = null;
let cachedAt = 0;
let inflight: Promise<number> | null = null;

const BALANCE_TTL_MS = 30000;

export async function getBalance(
  userId: string,
  options?: { force?: boolean },
): Promise<number> {
  if (!userId) return 0;

  const useCache =
    !options?.force &&
    cachedUserId === userId &&
    cachedBalance !== null &&
    Date.now() - cachedAt < BALANCE_TTL_MS;

  if (useCache) return cachedBalance as number;

  if (inflight) return inflight;

  inflight = fetch(apiUrl(`/api/payment/get-balance?userId=${userId}`))
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Failed to fetch balance");
      }
      const data = await response.json();
      const balance = data?.balance ?? 0;
      cachedBalance = balance;
      cachedUserId = userId;
      cachedAt = Date.now();
      return balance;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function clearBalanceCache() {
  cachedBalance = null;
  cachedUserId = null;
  cachedAt = 0;
  inflight = null;
}
