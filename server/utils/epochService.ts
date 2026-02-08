import { initWalrus } from "./walrusClient";

export interface EpochInfo {
  currentEpochNumber: number;
  epochDurationMs: number;
  epochStartTime: Date;
  epochEndTime: Date;
}

/**
 * Fetches current epoch information from Walrus
 */
export async function getCurrentEpochInfo(): Promise<EpochInfo> {
  try {
    const { suiClient } = await initWalrus();
    
    // Query the Walrus system state to get current epoch information
    // The epoch info is stored in the Walrus system state object
    const systemState = await suiClient.getLatestSuiSystemState();
    
    const currentEpochNumber = Number(systemState.epoch);
    
    // Prefer epoch duration from network; fallback to 14 days if unavailable
    const epochDurationMs =
      Number((systemState as any).epochDurationMs) || 14 * 24 * 60 * 60 * 1000;
    
    // For testnet, epochs typically start at 0:00 UTC
    // We'll calculate based on the assumption that each epoch is exactly 14 days
    // This is an approximation - in production you might want to query this from the chain
    
    const epochStartTimestamp = Number((systemState as any).epochStartTimestampMs || Date.now());
    const epochStartTime = new Date(epochStartTimestamp);
    const epochEndTime = new Date(epochStartTime.getTime() + epochDurationMs);
    
    return {
      currentEpochNumber,
      epochDurationMs,
      epochStartTime,
      epochEndTime,
    };
  } catch (error) {
    console.error("Failed to fetch epoch info from Walrus:", error);
    // Fallback to standard 14-day epochs
    const currentEpochNumber = Math.floor(Date.now() / (14 * 24 * 60 * 60 * 1000));
    const epochDurationMs = 14 * 24 * 60 * 60 * 1000;
    const epochStartTime = new Date(currentEpochNumber * epochDurationMs);
    const epochEndTime = new Date(epochStartTime.getTime() + epochDurationMs);
    
    return {
      currentEpochNumber,
      epochDurationMs,
      epochStartTime,
      epochEndTime,
    };
  }
}

/**
 * Calculates the expiration date for a blob based on the current epoch and number of epochs
 * @param numEpochs Number of epochs to store the blob
 * @param epochInfo Optional epoch info (will be fetched if not provided)
 * @returns The expiration date
 */
export async function calculateExpirationDate(
  numEpochs: number,
  epochInfo?: EpochInfo
): Promise<Date> {
  const info = epochInfo || await getCurrentEpochInfo();
  
  // Calculate: current epoch start + duration * numEpochs
  // 1 epoch means expiration at the end of the current epoch
  const expirationTimestamp = 
    info.epochStartTime.getTime() + 
    info.epochDurationMs * numEpochs;
  
  return new Date(expirationTimestamp);
}

/**
 * Formats a date for display to the user
 */
export function formatExpirationDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/**
 * Gets the number of days until expiration
 */
export function getDaysUntilExpiration(expirationDate: Date): number {
  const now = new Date();
  const diffMs = expirationDate.getTime() - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}


