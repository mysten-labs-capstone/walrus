import React, { useState, useEffect } from 'react';
import { DollarSign, AlertCircle, Loader2, Clock, CalendarPlus } from 'lucide-react';
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
  const [tempEpochs, setTempEpochs] = useState<number>(3);
  const user = authService.getCurrentUser();

  useEffect(() => {
    if (open) {
      setTempEpochs(selectedEpochs);
    }
  }, [open, selectedEpochs]);

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Call the cost preview endpoint
      const costResponse = await fetch(apiUrl('/api/payment/extend-duration-cost'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileSize,
          additionalEpochs: selectedEpochs,
        }),
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
        additionalDays: selectedEpochs * 14,
        additionalEpochs: selectedEpochs,
      });

      setBalance(balanceData.balance || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to load cost information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchCostAndBalance();
    }
  }, [open, selectedEpochs]);

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
            <p className="text-xs text-muted-foreground">Current storage: {currentEpochs * 14} days</p>
          </div>

          {/* Epoch Selection */}
          <div className="rounded-lg border-2 border-dashed border-blue-300/50 bg-blue-50/50 p-4 dark:border-blue-700/50 dark:bg-blue-950/20">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Extension Duration
              </label>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                +{tempEpochs * 14} days
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
                    ${cost?.costUSD?.toFixed(2) ?? '0.00'} USD
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ≈ {cost?.costSUI?.toFixed(4) ?? '0.00'} SUI
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
