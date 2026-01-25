import React, { useState, useEffect } from 'react';
import { DollarSign, AlertCircle, Loader2, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface PaymentApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File;
  onApprove: (costUSD: number, epochs: number) => void;
  onCancel: () => void;
  onEpochsChange?: (epochs: number) => void;
  epochs?: number;
}

interface CostInfo {
  costUSD: number;
  costSUI: number;
  sizeInMB: string;
  storageDays: number;
}

export function PaymentApprovalDialog({
  open,
  onOpenChange,
  file,
  onApprove,
  onCancel,
  onEpochsChange,
  epochs = 3,
}: PaymentApprovalDialogProps) {
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<CostInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpochs, setSelectedEpochs] = useState<number>(epochs);
  const [tempEpochs, setTempEpochs] = useState<number>(epochs);
  const [isInitialized, setIsInitialized] = useState(false);
  const user = authService.getCurrentUser();

  useEffect(() => {
    if (open && file && !isInitialized) {
      setSelectedEpochs(epochs);
      setTempEpochs(epochs);
      setIsInitialized(true);
    } else if (!open) {
      setIsInitialized(false);
    }
  }, [open, file, epochs, isInitialized]);

  useEffect(() => {
    if (open && file) {
      fetchCostAndBalance();
    }
  }, [open, file, selectedEpochs]);

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch cost
      const costResponse = await fetch(apiUrl('/api/payment/get-cost'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: file.size, epochs: selectedEpochs }),
      });

      if (!costResponse.ok) {
        throw new Error('Failed to calculate cost');
      }

      const costData = await costResponse.json();

      // Fetch balance
      const balanceResponse = await fetch(apiUrl(`/api/payment/get-balance?userId=${user.id}`));
      
      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance');
      }

      const balanceData = await balanceResponse.json();

      setCost({
        costUSD: costData.costUSD,
        costSUI: costData.costSUI,
        sizeInMB: costData.sizeInMB,
        storageDays: costData.storageDays,
      });
      setBalance(balanceData.balance || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load payment information');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !cost) return;

    // Check if user has sufficient balance
    if (balance < cost.costUSD) {
      setError('Insufficient balance. Please add funds to your account.');
      return;
    }

    // Notify parent of epoch selection
    if (onEpochsChange) {
      onEpochsChange(selectedEpochs);
    }

    // Don't deduct payment yet - just approve and proceed with upload
    // Payment will be deducted by the backend after successful upload
    onOpenChange(false);
    
    // Small delay to ensure dialog closes before upload starts
    setTimeout(() => {
      onApprove(cost.costUSD, selectedEpochs);
    }, 100);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const insufficientFunds = cost && balance < cost.costUSD;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Approve Upload Payment
          </DialogTitle>
          <DialogDescription>
            Review the cost for uploading this file to Walrus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : error && !cost ? (
            <div className="rounded-lg bg-red-50 p-4 text-red-800 dark:bg-red-900/50 dark:text-red-200">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          ) : cost ? (
            <>
              {/* File Info */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h4 className="mb-2 font-semibold text-sm">File Details</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium truncate ml-2 max-w-[200px]">{file.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size:</span>
                    <span className="font-medium">{formatBytes(file.size)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Storage:</span>
                    <span className="font-medium">{cost.storageDays} days</span>
                  </div>
                </div>
              </div>

              {/* Storage Duration Selector */}
              <div className="rounded-lg border-2 border-dashed border-purple-300/50 bg-purple-50/50 p-4 dark:border-purple-700/50 dark:bg-purple-950/20">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-sm">
                    <Clock className="h-4 w-4 inline mr-2" />
                    Storage Duration
                  </p>
                  <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                    {tempEpochs * 14} days
                  </span>
                </div>
                <Slider
                  value={[tempEpochs]}
                  onValueChange={(value: number[]) => setTempEpochs(value[0])}
                  onValueCommit={(value: number[]) => setSelectedEpochs(value[0])}
                  min={1}
                  max={13}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span>14 days</span>
                  <span>182 days</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Select how long your file will be stored on Walrus network
                </p>
              </div>

              {/* Cost Info */}
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <h4 className="mb-2 font-semibold text-sm">Upload Cost</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost (USD):</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      ${cost.costUSD.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost (SUI):</span>
                    <span className="font-medium">≈ {cost.costSUI.toFixed(3)} SUI</span>
                  </div>
                </div>
              </div>

              {/* Balance Info - Only show when funds are sufficient */}
              {!insufficientFunds && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Your Balance:</span>
                    <span className="font-bold">${balance.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span className="text-muted-foreground">After Upload:</span>
                    <span className="font-bold text-green-600 dark:text-green-400">
                      ${Math.max(0, balance - (cost?.costUSD || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Insufficient Funds Warning */}
              {insufficientFunds && (
                <div className="rounded-lg bg-red-100 p-3 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold">Insufficient Balance</p>
                      <p className="mt-1">
                        Your Balance: ${balance.toFixed(2)}. You need ${(cost.costUSD - balance).toFixed(2)} more to complete this upload.
                        Please add funds to your account.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Errors */}
              {error && (
                <div className="rounded-lg bg-red-100 p-3 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          {insufficientFunds ? (
            <Button
              onClick={() => {
                onOpenChange(false);
                window.location.href = '/payment';
              }}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              Add Funds
            </Button>
          ) : (
            <Button
              onClick={handleApprove}
              disabled={loading || !cost}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              {loading ? 'Processing...' : 'Approve & Upload'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
