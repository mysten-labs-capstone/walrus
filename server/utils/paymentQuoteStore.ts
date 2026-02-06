import crypto from "crypto";

type QuotePerFile = {
  tempId: string;
  costUSD: number;
  costSUI: number;
  sizeInMB: string;
  storageDays: number;
  epochs: number;
};

type QuoteRecord = {
  quoteId: string;
  userId: string;
  perFile: QuotePerFile[];
  totalCostUSD: number;
  totalCostSUI: number;
  createdAtMs: number;
  expiresAtMs: number;
};

const QUOTE_TTL_MS = 5 * 60 * 1000;
const quotes = new Map<string, QuoteRecord>();

function cleanupExpired() {
  const now = Date.now();
  for (const [quoteId, quote] of quotes.entries()) {
    if (quote.expiresAtMs <= now) {
      quotes.delete(quoteId);
    }
  }
}

export const paymentQuoteStore = {
  createQuote(params: {
    userId: string;
    perFile: QuotePerFile[];
    totalCostUSD: number;
    totalCostSUI: number;
  }) {
    cleanupExpired();

    const quoteId = crypto.randomUUID();
    const createdAtMs = Date.now();
    const expiresAtMs = createdAtMs + QUOTE_TTL_MS;

    const record: QuoteRecord = {
      quoteId,
      userId: params.userId,
      perFile: params.perFile,
      totalCostUSD: params.totalCostUSD,
      totalCostSUI: params.totalCostSUI,
      createdAtMs,
      expiresAtMs,
    };

    quotes.set(quoteId, record);

    return {
      quoteId,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  },
  getQuote(quoteId: string) {
    cleanupExpired();
    return quotes.get(quoteId) ?? null;
  },
};
