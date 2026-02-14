import { apiUrl } from "../config/api";

interface EpochConfig {
  daysPerEpoch: number;
  epochDurationMs: number;
  currentEpochNumber: number;
}

let cachedEpochConfig: EpochConfig | null = null;

/**
 * Fetches the epoch duration configuration from the server
 * Results are cached for the lifetime of the application
 */
export async function getEpochConfig(): Promise<EpochConfig> {
  if (cachedEpochConfig) {
    return cachedEpochConfig;
  }

  try {
    const response = await fetch(apiUrl("/api/config/epoch-duration"));
    const data = await response.json();
    cachedEpochConfig = data;
    return data;
  } catch (error) {
    console.error("[epochConfig] Failed to fetch epoch configuration:", error);
    // Fallback to mainnet defaults (14 days per epoch)
    const fallback: EpochConfig = {
      daysPerEpoch: 14,
      epochDurationMs: 14 * 24 * 60 * 60 * 1000,
      currentEpochNumber: 0,
    };
    cachedEpochConfig = fallback;
    return fallback;
  }
}

/**
 * Gets the days per epoch (returns cached value if available)
 */
export async function getDaysPerEpoch(): Promise<number> {
  const config = await getEpochConfig();
  return config.daysPerEpoch;
}

/**
 * Clears the cached epoch configuration (useful for testing or refresh)
 */
export function clearEpochCache(): void {
  cachedEpochConfig = null;
}
