import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, CreditCard, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { authService } from '../services/authService';
import { apiUrl } from '../config/api';
import { STRIPE_PRICES } from '../config/stripePrices';
import TransactionHistory from '../components/TransactionHistory';

const ENABLE_STRIPE = import.meta.env.VITE_ENABLE_STRIPE_PAYMENTS === 'true';

type Message = { type: 'success' | 'error' | 'info'; text: string };

export function Payment() {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);

  const user = authService.getCurrentUser();
  const quickAmounts = useMemo(() => [1, 5, 10, 25, 50, 100], []);

  useEffect(() => {
    fetchBalance();
    fetchSuiPrice();

    // If returning from Stripe checkout, verify the session and refresh balance/history
    try {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      if (sessionId) {
        (async () => {
          try {
            const res = await fetch(apiUrl(`/api/stripe_payment/verify-session?session_id=${sessionId}`));
            const data = await res.json();
            if (res.ok && data.paymentStatus === 'paid') {
              // refresh balance and transaction history
              await fetchBalance();
              window.dispatchEvent(new Event('transactions:updated'));
              setMessage({ type: 'success', text: 'Payment completed — balance updated.' });
            }
          } catch (err) {
            console.error('Failed to verify stripe session', err);
          } finally {
            // remove session_id from URL so we don't re-run verification on reload
            try {
              const url = new URL(window.location.href);
              url.searchParams.delete('session_id');
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
      const response = await fetch(apiUrl(`/api/payment/get-balance?userId=${user.id}`));
      const data = await response.json();
      if (response.ok) setBalance(data.balance || 0);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const fetchSuiPrice = async () => {
    setPriceLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price'));
      const data = await response.json();
      if (response.ok && data.sui) setSuiPrice(data.sui);
    } catch (err) {
      console.error('Failed to fetch SUI price:', err);
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
        const response = await fetch(apiUrl('/api/payment/add-funds'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, amount, devBypass: true }),
        });

        const data = await response.json();
        if (response.ok) {
          setBalance(data.balance);
            setMessage({ type: 'info', text: `[DEV MODE] Added $${amount.toFixed(2)} to your account` });
            // notify transaction history to refresh
            window.dispatchEvent(new Event('transactions:updated'));
        } else {
          setMessage({ type: 'error', text: data.error || 'Failed to add funds' });
        }
      } catch {
        setMessage({ type: 'error', text: 'Dev payment failed' });
      } finally {
        setLoading(false);
      }
      return;
    }

    // Stripe enabled
    const priceId = STRIPE_PRICES[amount];
    if (!priceId) {
      setMessage({ type: 'error', text: 'Invalid amount selected.' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(apiUrl('/api/stripe_payment/create-session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, priceId }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMessage({ type: 'error', text: 'Unable to begin checkout.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to start checkout.' });
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = (msg: Message) => {
    const styles =
      msg.type === 'success'
        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-200'
        : msg.type === 'error'
        ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200'
        : 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200'; // info/dev mode

    const Icon =
      msg.type === 'success' ? CheckCircle : msg.type === 'error' ? AlertCircle : AlertCircle;

    return (
      <div className={`mt-3 flex items-start gap-2 rounded-md p-3 text-sm ${styles}`}>
        <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>{msg.text}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Navbar />

      <div className="container mx-auto px-6 py-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Wallet</h1>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr] items-start">
          {/* LEFT COLUMN */}
          <div className="space-y-6">
            {/* Add Funds */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" />
                  Add funds
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((amt) => (
                    <Button
                      key={amt}
                      type="button"
                      variant="outline"
                      disabled={loading}
                      onClick={() => startStripeCheckout(amt)}
                      className="font-semibold bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      ${amt}
                    </Button>
                  ))}
                </div>

                {message && renderMessage(message)}
              </CardContent>
            </Card>

            {/* Live Exchange */}
            <Card className="shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" />
                  Live exchange
                </CardTitle>
                <CardDescription>1 SUI in USD</CardDescription>
              </CardHeader>

              <CardContent>
                {priceLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Loading...
                  </div>
                ) : suiPrice !== null ? (
                  <>
                    <div className="text-2xl font-bold">
                      ${parseFloat(suiPrice.toFixed(4)).toString()}
                    </div>
                    <div className="text-xs text-muted-foreground">per token</div>
                  </>
                ) : (
                  <div className="text-sm text-red-500">Failed to load price</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-6">
            {/* Balance header */}
            <Card className="shadow-sm">
              <CardContent className="py-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-900">
                      <DollarSign className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                    </div>

                    <div>
                      <div className="text-sm text-muted-foreground">Account Balance</div>
                      <div className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                        ${balance.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transaction History (single wrapper only) */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Transaction History</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <TransactionHistory />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
