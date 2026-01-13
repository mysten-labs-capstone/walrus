import React, { useState, useEffect } from 'react';
import { DollarSign, AlertCircle, Loader2, Clock, CalendarPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface ExtendDurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blobId: string;
  fileName: string;
  fileSize: number;
  currentEpochs?: number;
  onSuccess: () => void;
}

interface ExtensionCostInfo {
  costUSD: number;
  costSUI: number;
  additionalDays: number;
  additionalEpochs: number;
}

export function ExtendDurationDialog({
  open,
  onOpenChange,
  blobId,
  fileName,
  fileSize,
  currentEpochs = 3,
  onSuccess,
}: ExtendDurationDialogProps) {
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<ExtensionCostInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEpochs, setSelectedEpochs] = useState<number>(3);
  const user = authService.getCurrentUser();

  // Predefined epoch options (1 epoch = 30 days)
  const epochOptions = [
    { epochs: 1, label: '30 days' },
    { epochs: 3, label: '90 days' },
    { epochs: 6, label: '180 days' },
    { epochs: 12, label: '365 days' },
  ];

  useEffect(() => {
    if (open) {
      fetchCostAndBalance();
    }
  }, [open, selectedEpochs]);

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Calculate cost for extension
      // Using the same pricing model as initial upload
      const MIST_PER_MB_PER_EPOCH = 1000;
      const MIN_STORAGE_COST_MIST = 1_000_000;
      const GAS_PER_MB = 0.0005;
      const MIST_PER_SUI = 1_000_000_000;

      const sizeInMB = fileSize / (1024 * 1024);
      const storageCostMist = Math.max(
        Math.ceil(sizeInMB * MIST_PER_MB_PER_EPOCH * selectedEpochs),
        MIN_STORAGE_COST_MIST
      );
      const storageCostSui = storageCostMist / MIST_PER_SUI;
      const walEquivalent = storageCostSui;
      const gasOverhead = sizeInMB * GAS_PER_MB;
      const costInSui = storageCostSui + walEquivalent + gasOverhead;

      // For simplicity, using a rough SUI to USD conversion (in production, this should call the API)
      // Assuming 1 SUI ≈ $1 for estimation
      const costInUSD = Math.max(0.01, costInSui);

      // Fetch balance
      const balanceResponse = await fetch(apiUrl(`/api/payment/get-balance?userId=${user.id}`));
      
      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance');
      }

      const balanceData = await balanceResponse.json();

      setCost({
        costUSD: costInUSD,
        costSUI: costInSui,
        additionalDays: selectedEpochs * 30,
        additionalEpochs: selectedEpochs,
      });
      setBalance(balanceData.balance || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load cost information');
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!user || !cost) return;

    // Check if user has sufficient balance
    if (balance < cost.costUSD) {
      setError('Insufficient balance. Please add funds to your account.');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch(apiUrl('/api/payment/extend-duration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          blobId,
          fileSize,
          additionalEpochs: selectedEpochs,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to extend storage duration');
      }

      const data = await response.json();
      
      // Update balance
      setBalance(data.newBalance);
      
      // Call success callback
      onSuccess();
      
      // Close dialog
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'Failed to extend storage duration');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5 text-blue-600" />
            Extend Storage Duration
          </DialogTitle>
          <DialogDescription>
            Add more time to keep your file stored on Walrus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Info */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground mt-1">{formatBytes(fileSize)}</p>
            <p className="text-xs text-muted-foreground">Current storage: {currentEpochs * 30} days</p>
          </div>

          {/* Epoch Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Select Extension Duration
            </label>
            <div className="grid grid-cols-2 gap-2">
              {epochOptions.map((option) => (
                <button
                  key={option.epochs}
                  onClick={() => setSelectedEpochs(option.epochs)}
                  className={`rounded-lg border p-3 text-sm font-medium transition-colors ${
                    selectedEpochs === option.epochs
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'border-gray-200 bg-white hover:border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Cost Display */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : cost ? (
            <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Extension Cost:</span>
                <div className="text-right">
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-400">
                    ${parseFloat(cost.costUSD.toFixed(4))} USD
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ≈ {parseFloat(cost.costSUI.toFixed(6))} SUI
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between border-t border-blue-200 pt-2 dark:border-blue-800">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Your Balance:</span>
                <span className={`text-sm font-semibold ${balance >= cost.costUSD ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  ${balance.toFixed(2)} USD
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-blue-200 pt-2 dark:border-blue-800">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Additional Time:</span>
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                  +{cost.additionalDays} days
                </span>
              </div>
            </div>
          ) : null}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExtend}
            disabled={loading || processing || !cost || balance < (cost?.costUSD || 0)}
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Clock className="mr-2 h-4 w-4" />
                Extend Storage
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
