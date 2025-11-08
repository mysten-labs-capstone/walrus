// Convert SUI and WAL to USD
// Used Emojis: 💬 ❗

let priceCache: {
    sui?: { price: number; timestamp: number };
    wal?: { price: number; timestamp: number };
  } = {};
  
  const CACHE_DURATION = 60000; // save prices for 60 seconds
  
  // CoinGecko API to get SUI and WAL prices
  export async function getSuiPriceUSD(): Promise<number> {
    const now = Date.now();
    
    // Return cached price if within the duration
    if (priceCache.sui && now - priceCache.sui.timestamp < CACHE_DURATION) {
      return priceCache.sui.price;
    }
  
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd"
      );
      const data = await response.json();
      const price = data.sui?.usd || 0;
      
      // store price in Cache
      priceCache.sui = { price, timestamp: now };
      
      console.log(`💬 SUI price: $${price}`);
      return price;
    } catch (err) {
      console.error("❗ Failed to fetch SUI price:", err);
      return priceCache.sui?.price || 0;
    }
  }
  // convert SUI to USD (amount in SUI, not MIST)
  export async function suiToUSD(suiAmount: number): Promise<number> {
    const price = await getSuiPriceUSD();
    return suiAmount * price;
  }
  
  // convert from smallest unit to token amount
  export function fromSmallestUnit(amount: string | number, decimals: number = 9): number {
    return Number(amount) / Math.pow(10, decimals);
  }
  
    // convert to smallest unit from token amount
  export function toSmallestUnit(amount: number, decimals: number = 9): bigint {
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
  }