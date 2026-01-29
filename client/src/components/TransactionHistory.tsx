import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";

type Tx = {
  id: string;
  amount: number;
  currency: string;
  type: string;
  description?: string | null;
  balanceAfter?: number | null;
  createdAt: string;
};

export function TransactionHistory() {
  const user = authService.getCurrentUser();
  const userId = user?.id;

  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const pageSize = 5;
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchTransactions(0, true);
    // listen for external refresh triggers (e.g. after add-funds)
    const handler = () => fetchTransactions(0, true);
    window.addEventListener("transactions:updated", handler);

    return () => {
      window.removeEventListener("transactions:updated", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchTransactions = async (pageToLoad = 0, replace = false) => {
    if (!userId) return;
    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        apiUrl(
          `/api/payment/transactions?userId=${userId}&limit=${pageSize}&skip=${pageToLoad * pageSize}`,
        ),
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to fetch transactions");

      const items: Tx[] = data.transactions || [];
      setHasMore(items.length === pageSize);
      setTransactions((prev) => (replace ? items : [...prev, ...items]));
      setPage(pageToLoad + 1);
    } catch (err: any) {
      setError(err.message || "Failed to load transactions");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div>
      {transactions.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No transactions yet.</p>
      )}

      <div className="space-y-2">
        {transactions.map((t) => {
          const descRaw = (t.description || "").trim();
          const isUpload = descRaw.startsWith("Upload:");
          const isExtend = descRaw.startsWith("Extend:");
          const isStripe = descRaw.toLowerCase().includes("stripe");
          const isFunds =
            descRaw.toLowerCase().includes("fund") ||
            (t.type === "credit" && !descRaw);
          let display = "";

          if (descRaw.startsWith("Extend:")) {
            // Remove any trailing parentheses like "(3 epochs)" that older records included
            const cleaned = descRaw
              .replace(/\s*\(\s*\d+\s*epochs?\s*\)/i, "")
              .trim();
            // If server wrote full phrase (e.g. "Extend: 42 days for filename"), show it.
            if (/for\s+\S+/i.test(cleaned)) display = cleaned;
            else {
              const m = cleaned.match(/Extend:\s*(\d+)\s*days/i);
              if (m) display = `Extend: ${m[1]} days`;
              else display = "Extended";
            }
          } else {
            display =
              descRaw || (t.type === "credit" ? "Funds added" : "Payment");
          }

          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-zinc-800 p-3"
            >
              <div>
                <div
                  className={`text-sm font-medium ${isUpload || isFunds || isExtend || isStripe ? "text-white" : ""}`}
                >
                  {display}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(t.createdAt).toLocaleString()}
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`text-sm font-semibold ${
                    t.amount >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {t.amount >= 0
                    ? `+$${t.amount.toFixed(2)}`
                    : `-$${Math.abs(t.amount).toFixed(2)}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Balance:{" "}
                  {t.balanceAfter != null
                    ? `$${t.balanceAfter.toFixed(2)}`
                    : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {hasMore && (
          <Button
            size="sm"
            onClick={() => fetchTransactions(page)}
            disabled={loading}
            className="bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? "Loading..." : "Load more"}
          </Button>
        )}
      </div>

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
    </div>
  );
}

export default TransactionHistory;
