import React, { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  Plus,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  FileText,
  Wallet,
  Loader2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "../components";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";
import { STRIPE_PRICES } from "../config/stripePrices";
import TransactionHistory from "../components/TransactionHistory";
import { clearBalanceCache, getBalance } from "../services/balanceService";
import "./css/Payment.css";

const ENABLE_STRIPE = import.meta.env.VITE_ENABLE_STRIPE_PAYMENTS === "true";

type Message = { type: "success" | "error" | "info"; text: string };

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function Payment() {
  const [balance, setBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);

  const [totalSpent, setTotalSpent] = useState<number>(0);
  const [totalStorageBytes, setTotalStorageBytes] = useState<number>(0);
  const [totalAdded, setTotalAdded] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const user = authService.getCurrentUser();
  const navigate = useNavigate();
  const addAmounts = useMemo(() => [5, 10, 25, 50, 100], []);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  useEffect(() => {
    fetchBalance();
    fetchSuiPrice();
    fetchStats();

    // If returning from Stripe checkout, verify the session and refresh balance/history
    try {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get("session_id");
      if (sessionId) {
        (async () => {
          try {
            const res = await fetch(
              apiUrl(
                `/api/stripe_payment/verify-session?session_id=${sessionId}`,
              ),
            );
            const data = await res.json();
            if (res.ok && data.paymentStatus === "paid") {
              // refresh balance and transaction history
              clearBalanceCache();
              await fetchBalance(true);
              window.dispatchEvent(new Event("balance-updated"));
              window.dispatchEvent(new Event("transactions:updated"));

              // Check if user was redirected from shared save or upload due to insufficient funds
              if (sessionStorage.getItem("pendingSharedSave")) {
                // Navigate back to shared view; FolderCardView will resume the save
                navigate("/home?view=shared");
              } else if (sessionStorage.getItem("openUploadAfterPayment")) {
                sessionStorage.removeItem("openUploadAfterPayment");
                // Navigate back to home and trigger upload dialog
                navigate("/home", { state: { openUploadDialog: true } });
              }
            }
          } catch (err) {
            console.error("Failed to verify stripe session", err);
          } finally {
            // remove session_id from URL so we don't re-run verification on reload
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete("session_id");
              window.history.replaceState({}, document.title, url.toString());
            } catch (_) {}
          }
        })();
      }
    } catch (e) {
      // ignore URL parsing errors
    }

    const interval = setInterval(fetchSuiPrice, 60000);
    const handleTransactionUpdate = () => fetchStats();
    window.addEventListener("transactions:updated", handleTransactionUpdate);
    return () => {
      clearInterval(interval);
      window.removeEventListener("transactions:updated", handleTransactionUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close add-amount dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.balance-add-dropdown')) {
        setAddDropdownOpen(false);
      }
    };

    if (addDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [addDropdownOpen]);

  const fetchBalance = async (force = false) => {
    if (!user) {
      setBalanceLoading(false);
      return;
    }
    setBalanceLoading(true);
    try {
      const balanceValue = await getBalance(user.id, { force });
      setBalance(balanceValue || 0);
    } catch (err) {
      console.error("Failed to fetch balance:", err);
    } finally {
      setBalanceLoading(false);
    }
  };

  const fetchSuiPrice = async () => {
    setPriceLoading(true);
    try {
      const response = await fetch(apiUrl("/api/price"));
      const data = await response.json();
      if (response.ok && data.sui) setSuiPrice(data.sui);
    } catch (err) {
      console.error("Failed to fetch SUI price:", err);
    } finally {
      setPriceLoading(false);
    }
  };

  const fetchStats = async () => {
    if (!user) return;
    setStatsLoading(true);
    try {
      const filesRes = await fetch(
        apiUrl(`/api/cache?userId=${user.id}&action=stats`),
      );
      if (filesRes.ok) {
        const filesData = await filesRes.json();
        setTotalStorageBytes(filesData.totalSizeBytes ?? 0);
      }
      const txRes = await fetch(
        apiUrl(`/api/payment/transactions?userId=${user.id}&limit=1000`),
      );
      if (txRes.ok) {
        const txData = await txRes.json();
        const transactions = txData.transactions || [];
        const spent = transactions
          .filter((t: { amount: number }) => t.amount < 0)
          .reduce((sum: number, t: { amount: number }) => sum + Math.abs(t.amount), 0);
        setTotalSpent(spent);
        const added = transactions
          .filter((t: { amount: number }) => t.amount > 0)
          .reduce((sum: number, t: { amount: number }) => sum + t.amount, 0);
        setTotalAdded(added);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    } finally {
      setStatsLoading(false);
    }
  };

  const startStripeCheckout = async (amount: number) => {
    if (!user) return;

    // DEV MODE: stripe disabled (still perform backend top-up)
    if (!ENABLE_STRIPE) {
      setLoading(true);
      setMessage(null);
      try {
        const response = await fetch(apiUrl("/api/payment/add-funds"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, amount, devBypass: true }),
        });

        const data = await response.json();
        if (response.ok) {
          clearBalanceCache();
          setBalance(data.balance);
          window.dispatchEvent(new Event("balance-updated"));
          // notify transaction history to refresh
          window.dispatchEvent(new Event("transactions:updated"));

          // Check if user was redirected from shared save or upload due to insufficient funds
          if (sessionStorage.getItem("pendingSharedSave")) {
            // Navigate back to shared view; FolderCardView will resume the save
            navigate("/home?view=shared");
          } else if (sessionStorage.getItem("openUploadAfterPayment")) {
            sessionStorage.removeItem("openUploadAfterPayment");
            // Navigate to home and trigger upload dialog
            navigate("/home", { state: { openUploadDialog: true } });
          }
        } else {
          setMessage({
            type: "error",
            text: data.error || "Failed to add funds",
          });
        }
      } catch {
        setMessage({ type: "error", text: "Dev payment failed" });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Stripe enabled
    const priceId = STRIPE_PRICES[amount];
    if (!priceId) {
      setMessage({ type: "error", text: "Invalid amount selected." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(
        apiUrl("/api/stripe_payment/create-session"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, priceId }),
        },
      );

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage({ type: "error", text: "Unable to begin checkout." });
      }
    } catch {
      setMessage({ type: "error", text: "Failed to start checkout." });
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message) => {
    const className =
      msg.type === "success"
        ? "message-box message-success"
        : msg.type === "error"
          ? "message-box message-error"
          : "message-box message-info";

    const Icon =
      msg.type === "success"
        ? CheckCircle
        : msg.type === "error"
          ? AlertCircle
          : AlertCircle;

    return (
      <div className={className}>
        <Icon className="message-icon" />
        <span>{msg.text}</span>
      </div>
    );
  };

  return (
    <AppLayout showHeader={false}>
      <div className="payment-content">
        {/* Combined: Account Balance, Live Exchange, and Add Funds */}
        <div className="payment-card mb-6">
          <div className="combined-card-content">
            {/* Single Row: Balance, Exchange, and Add Funds */}
            <div className="combined-single-row">
              {/* Account Balance + Add funds dropdown */}
              <div className="combined-balance-section">
                <div>
                  <div className="balance-label">Account Balance</div>
                  <div className="balance-row">
                    <div className="balance-amount">
                      {balanceLoading ? (
                        <Loader2 className="payment-loading-icon" />
                      ) : (
                        `$${balance.toFixed(2)}`
                      )}
                    </div>
                    <div className="balance-add-dropdown">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setAddDropdownOpen(!addDropdownOpen)}
                        className="balance-add-btn"
                        aria-label="Add funds"
                      >
                        <Plus className="balance-add-icon" />
                      </button>
                      {addDropdownOpen && (
                        <div className="balance-add-menu">
                          {addAmounts.map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              disabled={loading}
                              onClick={() => {
                                startStripeCheckout(amt);
                                setAddDropdownOpen(false);
                              }}
                              className="balance-add-menu-item"
                            >
                              ${amt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                {message && renderMessage(message)}
              </div>

              {/* Divider */}
              <div className="combined-vertical-divider" />

              {/* Live Exchange */}
              <div className="combined-exchange-section">
                <div className="exchange-header">
                  <TrendingUp className="card-title-icon" />
                  <span className="exchange-header-text">Live Exchange</span>
                </div>
                {priceLoading ? (
                  <div className="exchange-loading">
                    <Loader2 className="payment-loading-icon" />
                  </div>
                ) : suiPrice !== null ? (
                  <div className="exchange-content">
                    <div className="exchange-price">1 SUI = ${suiPrice.toFixed(2)}</div>
                  </div>
                ) : (
                  <div className="exchange-error">Failed to load price</div>
                )}
              </div>

              {/* Divider */}
              <div className="combined-vertical-divider" />

              {/* Total Spent */}
              <div className="combined-metric-section">
                <div className="metric-header">
                  <DollarSign className="card-title-icon" />
                  <span className="metric-header-text">Total Spent</span>
                </div>
                <div className="metric-value">
                  {statsLoading ? (
                    <Loader2 className="payment-loading-icon" />
                  ) : (
                    `$${totalSpent.toFixed(2)}`
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="combined-vertical-divider" />

              {/* Total Added */}
              <div className="combined-metric-section">
                <div className="metric-header">
                  <Wallet className="card-title-icon" />
                  <span className="metric-header-text">Total Added</span>
                </div>
                <div className="metric-value">
                  {statsLoading ? (
                    <Loader2 className="payment-loading-icon" />
                  ) : (
                    `$${totalAdded.toFixed(2)}`
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="combined-vertical-divider" />

              {/* Storage */}
              <div className="combined-metric-section">
                <div className="metric-header">
                  <FileText className="card-title-icon" />
                  <span className="metric-header-text">Storage</span>
                </div>
                <div className="metric-value">
                  {statsLoading ? (
                    <Loader2 className="payment-loading-icon" />
                  ) : (
                    formatBytes(totalStorageBytes)
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Transaction History */}
        <div className="payment-card">
          <div className="transaction-card-header">
            <h2 className="transaction-card-title">Transaction History</h2>
          </div>
          <div className="transaction-card-content">
            <TransactionHistory />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
