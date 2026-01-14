// Convert SUI and WAL to USD
// Used Emojis: 💬 ❗

let priceCache: {
    sui?: { price: number; timestamp: number };
    wal?: { price: number; timestamp: number };
  } = {};
  
  const CACHE_DURATION = 60000; // save prices for 60 seconds

  // CoinGecko API to get SUI and WAL prices
  async function fetchCoinGeckoPrice(ids: string): Promise<any> {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url, { cache: "no-store" });
    return res.json();
  }
  
  export async function getSuiPriceUSD(): Promise<number> {
    const now = Date.now();
    
    // if price is cached, return
    if (priceCache.sui && now - priceCache.sui.timestamp < CACHE_DURATION) {
      return priceCache.sui.price;
    }
  
    try {
      const data = await fetchCoinGeckoPrice("sui");
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

  export async function getWalPriceUSD(): Promise<number> {
    const now = Date.now();
    if (priceCache.wal && now - priceCache.wal.timestamp < CACHE_DURATION) {
      return priceCache.wal.price;
    }
  
    try {
      const data = await fetchCoinGeckoPrice("walrus-2"); // walrus-2 is the correct one
      const price = data?.["walrus-2"]?.usd ?? 0;
  
      priceCache.wal = { price, timestamp: now };
      console.log(`💬 WAL price: $${price}`);
      return price;
    } catch (err) {
      console.error("❗ Failed to fetch WAL price:", err);
      return priceCache.wal?.price ?? 0;
    }
  }

  
  // convert SUI to USD (amount in SUI, not MIST)
  export async function suiToUSD(suiAmount: number): Promise<number> {
    const price = await getSuiPriceUSD();
    return suiAmount * price;
  }
  // convert WAL to USD
  export async function walToUSD(walAmount: number): Promise<number> {
    const price = await getWalPriceUSD();
    return walAmount * price;
  }
  
  // convert from smallest unit to token amount
  export function fromSmallestUnit(amount: string | number, decimals: number = 9): number {
    return Number(amount) / Math.pow(10, decimals);
  }
  
    // convert to smallest unit from token amount
  export function toSmallestUnit(amount: number, decimals: number = 9): bigint {
    return BigInt(Math.floor(amount * Math.pow(10, decimals)));
  }