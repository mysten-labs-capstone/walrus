import { getSuiPriceUSD, getWalPriceUSD } from "@/utils/priceConverter";

// MARKUP
const PROFIT_MARKUP = 0.25;
const MARKUP_MULTIPLIER = 1 + PROFIT_MARKUP;

// --- WALRUS MAINNET PRICING (from `walrus --context mainnet info`) ---
// Units
const BYTES_PER_MIB = 1024 * 1024;
const FROST_PER_WAL = 1_000_000_000;

// Encoded multiplier (from docs) estimate to be about 7x for small files (1MB -1000MB)
const ENCODED_MULTIPLIER = 7; // CHANGE TO PIECEWISE FUNCTION WHEN LARGER FILES ARE ALLOWED (>5GB)

// Per-epoch pricing
const METADATA_WAL_PER_EPOCH = 0.0007; // WAL
const WRITE_FROST_PER_EPOCH = 20_000; // FROST
const MARGINAL_FROST_PER_MIB_PER_EPOCH = 66_000; // FROST per 1 MiB (unencoded) per epoch

// SUI gas cost (cost of 3 sui transactions)
const SUI_TX = 0.005;

// WAL upload fee per GB
const WAL_UPLOAD_PER_GB = 0.02; // matches the online walrus cost calculator

// Default epochs if not provided
export const DEFAULT_EPOCHS = 3;

type PriceSnapshot = {
  sui: number;
  wal: number;
};

export async function fetchPrices(): Promise<PriceSnapshot> {
  try {
    const sui = await getSuiPriceUSD();
    const wal = await getWalPriceUSD();
    return { sui, wal };
  } catch (err) {
    console.error("Price fetch error, using fallback:", err);
    return { sui: 1.85, wal: 0.15 };
  }
}

export async function calculateCost(params: {
  fileSize: number;
  epochs?: number;
  prices?: PriceSnapshot;
}) {
  const { fileSize, epochs, prices } = params;

  if (!fileSize || fileSize <= 0) {
    throw new Error("Invalid file size");
  }

  const encodedSize = fileSize * ENCODED_MULTIPLIER;
  const numEpochs =
    typeof epochs === "number" && epochs > 0 ? epochs : DEFAULT_EPOCHS;

  // Walrus bills in 1 MiB storage units
  const sizeMiBExact = encodedSize / BYTES_PER_MIB;
  const sizeMiBUnits = Math.max(1, Math.ceil(sizeMiBExact)); // minimum 1 MiB

  // Convert metadata WAL -> FROST (so everything can sum in FROST cleanly)
  const metadataFrostPerEpoch = Math.round(
    METADATA_WAL_PER_EPOCH * FROST_PER_WAL,
  );

  // Total FROST per epoch = metadata + write fee + marginal storage
  const marginalFrostPerEpoch = sizeMiBUnits * MARGINAL_FROST_PER_MIB_PER_EPOCH;
  const totalFrostPerEpoch =
    metadataFrostPerEpoch + WRITE_FROST_PER_EPOCH + marginalFrostPerEpoch;

  const walPerEpoch = totalFrostPerEpoch / FROST_PER_WAL;

  // WAL upload cost:
  const sizeGB = encodedSize / (1024 * 1024 * 1024);
  const walUploadOverhead = sizeGB * WAL_UPLOAD_PER_GB;

  // calculate total WAL cost:
  const walTotal = walPerEpoch * numEpochs + walUploadOverhead;

  const priceSnapshot = prices ?? (await fetchPrices());
  const suiTxUSD = SUI_TX * priceSnapshot.sui;

  const walUSD = priceSnapshot.wal * walTotal;
  const totalUSD = walUSD + suiTxUSD;

  const finalCost = Math.max(0.01, MARKUP_MULTIPLIER * totalUSD);

  return {
    fileSize,
    sizeInMB: (fileSize / (1024 * 1024)).toFixed(2),
    sizeInGB: (fileSize / (1024 * 1024 * 1024)).toFixed(4),
    costSUI: parseFloat((finalCost / priceSnapshot.sui).toFixed(8)),
    costUSD: Number(finalCost.toFixed(4)),
    epochs: numEpochs,
    storageDays: numEpochs * 14,
  };
}
