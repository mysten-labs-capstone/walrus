import React, { useState, useEffect } from 'react';
import { DollarSign, CreditCard, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { authService } from '../services/authService';
import { apiUrl, getServerOrigin } from '../config/api';

export function Payment() {
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [suiPrice, setSuiPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(true);
  const user = authService.getCurrentUser();

  useEffect(() => {
    fetchBalance();
    fetchSuiPrice();
    
    // Refresh SUI price every 60 seconds
    const interval = setInterval(fetchSuiPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchBalance = async () => {
    if (!user) return;
    
    try {
      const response = await fetch(apiUrl(`/api/payment/get-balance?userId=${user.id}`));
      const data = await response.json();
      
      if (response.ok) {
        setBalance(data.balance || 0);
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    }
  };

  const fetchSuiPrice = async () => {
    setPriceLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price'));
      const data = await response.json();
      
      if (response.ok && data.sui) {
        setSuiPrice(data.sui);
      }
    } catch (err) {
      console.error('Failed to fetch SUI price:', err);
    } finally {
      setPriceLoading(false);
    }
  };

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !amount) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(apiUrl('/api/payment/add-funds'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          amount: numAmount,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setBalance(data.balance);
        setAmount('');
        setMessage({ type: 'success', text: `Successfully added $${numAmount.toFixed(2)} to your account!` });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to add funds' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to add funds' });
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = [5, 10, 25, 50, 100];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <Navbar />
      
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Payment Center</h1>
          <p className="mt-2 text-muted-foreground">Manage your account balance and add funds</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Current Balance Card */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-800 dark:from-blue-950 dark:to-indigo-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
                Current Balance
              </CardTitle>
              <CardDescription>Your available funds for uploads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-5xl font-bold text-blue-600 dark:text-blue-400">
                ${balance.toFixed(2)}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                This balance will be used to pay for file uploads
              </p>
            </CardContent>
          </Card>

          {/* Add Funds Card */}
          <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 dark:border-green-800 dark:from-green-950 dark:to-emerald-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
                Add Funds
              </CardTitle>
              <CardDescription>Add money to your account balance</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddFunds} className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium">Amount (USD)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="text-lg"
                    disabled={loading}
                  />
                </div>

                {/* Quick Amount Buttons */}
                <div>
                  <label className="mb-2 block text-sm font-medium">Quick Select</label>
                  <div className="flex flex-wrap gap-2">
                    {quickAmounts.map((amt) => (
                      <Button
                        key={amt}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(amt.toString())}
                        disabled={loading}
                        className="border-green-300 hover:bg-green-100 dark:border-green-700 dark:hover:bg-green-900"
                      >
                        ${amt}
                      </Button>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                  disabled={loading || !amount}
                >
                  {loading ? 'Processing...' : 'Add Funds'}
                </Button>
              </form>

              {/* Message Display */}
              {message && (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-lg p-3 ${
                    message.type === 'success'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                  }`}
                >
                  {message.type === 'success' ? (
                    <CheckCircle className="h-5 w-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  )}
                  <p className="text-sm">{message.text}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Exchange Rate Card */}
          <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 dark:border-purple-800 dark:from-purple-950 dark:to-pink-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg">
                  <TrendingUp className="h-5 w-5 text-white" />
                </div>
                Live Exchange Rate
              </CardTitle>
              <CardDescription>Price of 1 SUI in USD</CardDescription>
            </CardHeader>
            <CardContent>
              {priceLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple-600 border-t-transparent"></div>
                  Loading...
                </div>
              ) : suiPrice !== null ? (
                <div>
                  <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                    ${suiPrice.toFixed(4)}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    per 1 SUI token
                  </p>
                </div>
              ) : (
                <p className="text-sm text-red-600 dark:text-red-400">
                  Failed to load exchange rate
                </p>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>How it Works</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Add funds to your account balance to pay for file uploads</p>
              <p>• Upload costs = Storage (SUI) + Storage (WAL) + Gas overhead</p>
              <p>• Minimum per file: 0.001 SUI + 0.001 WAL ≈ $0.006-0.01</p>
              <p>• Large files: +1000 MIST per MB per epoch (90 days = 3 epochs)</p>
              <p>• You'll see the exact cost and approve before each upload</p>
              <p>• Unused funds remain in your account for future uploads</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
