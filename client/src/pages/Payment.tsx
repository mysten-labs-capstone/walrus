import React, { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  CreditCard,
  AlertCircle,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import { Navbar } from "../components/Navbar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
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
  const quickAmounts = useMemo(() => [5, 10, 25, 50, 100], []);

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
    const styleClass =
      msg.type === "success"
        ? "message-success"
        : msg.type === "error"
          ? "message-error"
          : "message-info";
    const Icon = msg.type === "success" ? CheckCircle : AlertCircle;

    return (
      <div className={`message-box ${styleClass}`}>
        <Icon className="message-icon" />
        <span>{msg.text}</span>
      </div>
    );
  };

  return (
    <div className="payment-page">
      <Navbar />

      <div className="payment-container">
        <div className="payment-header">
          <h1 className="payment-title">Wallet</h1>
        </div>

        <div className="payment-grid">
          {/* LEFT COLUMN */}
          <div className="payment-left">
            {/* Add Funds */}
            <Card className="card-shadow">
              <CardHeader className="card-header-pb-3">
                <CardTitle className="card-title">
                  <CreditCard className="icon-small" />
                  Add funds
                </CardTitle>
              </CardHeader>

              <CardContent className="card-content-space">
                <div className="quick-grid">
                  {quickAmounts.map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant="outline"
                      disabled={loading}
                      onClick={() => startStripeCheckout(amt)}
                      className="quick-amount"
                    >
                      ${amt}
                    </Button>
                  ))}
                </div>

                {message && renderMessage(message)}
              </CardContent>
            </Card>

            {/* Live Exchange */}
            <Card className="card-shadow">
              <CardHeader className="card-header-pb-2">
                <CardTitle className="card-title">
                  <TrendingUp className="icon-small" />
                  Live exchange
                </CardTitle>
                <CardDescription>1 SUI in USD</CardDescription>
              </CardHeader>

              <CardContent>
                {priceLoading ? (
                  <div className="price-loading">
                    <div className="price-spinner" />
                    Loading...
                  </div>
                ) : suiPrice !== null ? (
                  <>
                    <div className="sui-price">
                      ${parseFloat(suiPrice.toFixed(4)).toString()}
                    </div>
                    <div className="sui-pertoken">per token</div>
                  </>
                ) : (
                  <div className="price-error">Failed to load price</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div className="payment-right">
            {/* Balance header */}
            <Card className="card-shadow">
              <CardContent className="balance-card-content">
                <div className="balance-row">
                  <div className="balance-left">
                    <div className="balance-icon">
                      <DollarSign className="balance-icon-svg" />
                    </div>

                    <div>
                      <div className="account-balance-label">
                        Account Balance
                      </div>
                      <div className="balance-amount">
                        ${balance.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transaction History (single wrapper only) */}
            <Card className="card-shadow">
              <CardHeader className="card-header-pb-3">
                <CardTitle className="card-title-small">
                  Transaction History
                </CardTitle>
              </CardHeader>
              <CardContent className="card-content-pt-0">
                <TransactionHistory />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
