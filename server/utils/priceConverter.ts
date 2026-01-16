// Convert SUI and WAL to USD
// Used Emojis: 💬 ●

// Global cache that persists across requests
const globalPriceCache = global as typeof globalThis & {
  priceCache?: {
    sui?: { price: number; timestamp: number };
    wal?: { price: number; timestamp: number };
  };
};

if (!globalPriceCache.priceCache) {
  globalPriceCache.priceCache = {};
}

const CACHE_DURATION = 60000; // 60 seconds

// Fallback prices if API fails
const FALLBACK_SUI_PRICE = 1.85;
const FALLBACK_WAL_PRICE = 0.15;

// CoinGecko API with rate limit handling
async function fetchCoinGeckoPrice(ids: string): Promise<any> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  
  try {
    const res = await fetch(url, { 
      cache: "no-store",
      headers: {
        'Accept': 'application/json',
      }
    });
    
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error('CoinGecko rate limit exceeded');
      }
      throw new Error(`CoinGecko API returned ${res.status}`);
    }
    
    return res.json();
  } catch (err) {
    console.error('● CoinGecko fetch error:', err);
    throw err;
  }
}

export async function getSuiPriceUSD(): Promise<number> {
  const now = Date.now();
  const cache = globalPriceCache.priceCache!;
  
  // Return cached price if valid and not expired
  if (cache.sui && cache.sui.price > 0 && now - cache.sui.timestamp < CACHE_DURATION) {
    console.log(`💬 Using cached SUI price: $${cache.sui.price} (age: ${Math.round((now - cache.sui.timestamp) / 1000)}s)`);
    return cache.sui.price;
  }

  try {
    const data = await fetchCoinGeckoPrice("sui");
    const price = data.sui?.usd;
    
    if (typeof price !== "number" || price <= 0) {
      throw new Error("Invalid SUI price received from API");
    }
    
    // Store in global cache
    cache.sui = { price, timestamp: now };
    
    console.log(`💬 SUI price fetched from API: $${price}`);
    return price;
  } catch (err) {
    console.error("● Failed to fetch SUI price:", err);
    
    // Return stale cache if available (even if expired)
    if (cache.sui?.price && cache.sui.price > 0) {
      const age = Math.round((now - cache.sui.timestamp) / 1000);
      console.log(`💬 Using stale cached SUI price: $${cache.sui.price} (age: ${age}s)`);
      return cache.sui.price;
    }
    
    // Last resort: fallback
    console.log(`💬 Using fallback SUI price: $${FALLBACK_SUI_PRICE}`);
    return FALLBACK_SUI_PRICE;
  }
}

export async function getWalPriceUSD(): Promise<number> {
  const now = Date.now();
  const cache = globalPriceCache.priceCache!;
  
  // Return cached price if valid and not expired
  if (cache.wal && cache.wal.price > 0 && now - cache.wal.timestamp < CACHE_DURATION) {
    console.log(`💬 Using cached WAL price: $${cache.wal.price} (age: ${Math.round((now - cache.wal.timestamp) / 1000)}s)`);
    return cache.wal.price;
  }

  try {
    const data = await fetchCoinGeckoPrice("walrus-2");
    const price = data?.["walrus-2"]?.usd;
    
    if (typeof price !== "number" || price <= 0) {
      throw new Error("Invalid WAL price received from API");
    }
  
    // Store in global cache
    cache.wal = { price, timestamp: now };
  
    console.log(`💬 WAL price fetched from API: $${price}`);
    return price;
  } catch (err) {
    console.error("● Failed to fetch WAL price:", err);
    
    // Return stale cache if available (even if expired)
    if (cache.wal?.price && cache.wal.price > 0) {
      const age = Math.round((now - cache.wal.timestamp) / 1000);
      console.log(`💬 Using stale cached WAL price: $${cache.wal.price} (age: ${age}s)`);
      return cache.wal.price;
    }
    
    // Last resort: fallback
    console.log(`💬 Using fallback WAL price: $${FALLBACK_WAL_PRICE}`);
    return FALLBACK_WAL_PRICE;
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