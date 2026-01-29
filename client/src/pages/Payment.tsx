import React, { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  CreditCard,
  AlertCircle,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "../components/AppLayout";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";
import { STRIPE_PRICES } from "../config/stripePrices";
import TransactionHistory from "../components/TransactionHistory";
import "./css/Payment.css";

const ENABLE_STRIPE = import.meta.env.VITE_ENABLE_STRIPE_PAYMENTS === "true";

type Message = { type: "success" | "error" | "info"; text: string };

export function Payment() {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);

  const user = authService.getCurrentUser();
  const quickAmounts = useMemo(() => [5, 10, 25, 50, 100, 200], []);

  useEffect(() => {
    fetchBalance();
    fetchSuiPrice();

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
              await fetchBalance();
              window.dispatchEvent(new Event("transactions:updated"));
              setMessage({
                type: "success",
                text: "Payment completed — balance updated.",
              });
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
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchBalance = async () => {
    if (!user) return;
    try {
      const response = await fetch(
        apiUrl(`/api/payment/get-balance?userId=${user.id}`),
      );
      const data = await response.json();
      if (response.ok) setBalance(data.balance || 0);
    } catch (err) {
      console.error("Failed to fetch balance:", err);
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
          setBalance(data.balance);
          setMessage({
            type: "info",
            text: `[DEV MODE] Added $${amount.toFixed(2)} to your account`,
          });
          // notify transaction history to refresh
          window.dispatchEvent(new Event("transactions:updated"));
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
    <AppLayout>
      <div className="payment-content">

        <div className="payment-grid">
          {/* LEFT COLUMN */}
          <div className="payment-left-column">
            {/* Add Funds */}
            <div className="payment-card">
              <div className="card-header">
                <h2 className="card-title text-white">
                  <CreditCard className="card-title-icon" />
                  Add funds
                </h2>
              </div>

              <div className="card-content">
                <div className="quick-amounts-grid">
                  {quickAmounts.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      disabled={loading}
                      onClick={() => startStripeCheckout(amt)}
                      className="amount-button"
                    >
                      ${amt}
                    </button>
                  ))}
                </div>

                {message && renderMessage(message)}
              </div>
            </div>

            {/* Live Exchange */}
            <div className="payment-card">
              <div className="card-header">
                <h2 className="card-title">
                  <TrendingUp className="card-title-icon" />
                  Live exchange
                </h2>
                <p className="card-description">1 SUI in USD</p>
              </div>

              <div className="card-content">
                {priceLoading ? (
                  <div className="exchange-loading">
                    <div className="exchange-spinner" />
                    Loading...
                  </div>
                ) : suiPrice !== null ? (
                  <>
                    <div className="exchange-price">
                      ${parseFloat(suiPrice.toFixed(4)).toString()}
                    </div>
                    <div className="exchange-label">per token</div>
                  </>
                ) : (
                  <div className="exchange-error">Failed to load price</div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="payment-right-column">
            {/* Balance header */}
            <div className="payment-card">
              <div className="balance-card-content">
                <div className="balance-wrapper">
                  <div className="balance-inner">
                    <div className="balance-icon-wrapper">
                      <DollarSign className="balance-icon" />
                    </div>

                    <div>
                      <div className="balance-label">Account Balance</div>
                      <div className="balance-amount">
                        ${balance.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Transaction History */}
            <div className="payment-card">
              <div className="transaction-card-header">
                <h2 className="transaction-card-title">Transaction History</h2>
              </div>
              <div className="transaction-card-content">
                <TransactionHistory />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
