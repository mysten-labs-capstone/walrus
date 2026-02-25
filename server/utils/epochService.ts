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
    const { suiClient, network } = await initWalrus();
    
    // Query the Sui system state to get current epoch information
    const systemState = await suiClient.getLatestSuiSystemState();
    
    const currentEpochNumber = Number(systemState.epoch);
    
    // Epoch duration depends on the network:
    // - Testnet: 1 day per epoch (86400000 ms)
    // - Mainnet: 14 days per epoch (1209600000 ms)
    const epochDurationMs = network === "testnet" 
      ? 1 * 24 * 60 * 60 * 1000      // 1 day for testnet
      : 14 * 24 * 60 * 60 * 1000;    // 14 days for mainnet
    
    // Get epoch start timestamp from system state
    const epochStartTimestamp = Number(systemState.epochStartTimestampMs || Date.now());
    const epochStartTime = new Date(epochStartTimestamp);
    const epochEndTime = new Date(epochStartTime.getTime() + epochDurationMs);
    
    console.log(`[EpochService] Network: ${network}, Epoch Duration: ${epochDurationMs / (24 * 60 * 60 * 1000)} days`);
    
    return {
      currentEpochNumber,
      epochDurationMs,
      epochStartTime,
      epochEndTime,
    };
  } catch (error) {
    console.error("Failed to fetch epoch info from Walrus:", error);
    // Fallback to testnet default (1 day epochs)
    const epochDurationMs = 1 * 24 * 60 * 60 * 1000;
    const currentEpochNumber = Math.floor(Date.now() / epochDurationMs);
    const epochStartTime = new Date(currentEpochNumber * epochDurationMs);
    const epochEndTime = new Date(epochStartTime.getTime() + epochDurationMs);
    
    console.log(`[EpochService] Using fallback: 1 day epochs (testnet default)`);
    
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


