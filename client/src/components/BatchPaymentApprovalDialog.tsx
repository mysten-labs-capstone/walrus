import React, { useState, useEffect } from 'react';
import { DollarSign, AlertCircle, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { apiUrl } from '../config/api';
import { authService } from '../services/authService';

interface BatchPaymentApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: Array<{ id: string; filename: string; size: number; paymentAmount?: number }>;
  onApprove: () => void;
  onCancel: () => void;
}

interface TotalCostInfo {
  totalCostUSD: number;
  totalCostSUI: number;
  totalSizeMB: number;
  fileCount: number;
  storageDays: number;
}

export function BatchPaymentApprovalDialog({
  open,
  onOpenChange,
  files,
  onApprove,
  onCancel,
}: BatchPaymentApprovalDialogProps) {
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<TotalCostInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = authService.getCurrentUser();

  useEffect(() => {
    if (open && files.length > 0) {
      fetchCostAndBalance();
    }
  }, [open, files]);

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Calculate total size
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);

      // Fetch cost for total size
      const costResponse = await fetch(apiUrl('/api/payment/get-cost'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: totalSize }),
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
        totalCostUSD: costData.costUSD,
        totalCostSUI: costData.costSUI,
        totalSizeMB: parseFloat(costData.sizeInMB),
        fileCount: files.length,
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
    if (balance < cost.totalCostUSD) {
      setError('Insufficient balance. Please add funds to your account.');
      return;
    }

    // Don't deduct payment upfront - each file upload will deduct individually
    // Just close the dialog and proceed
    onOpenChange(false);
    
    // Small delay to ensure dialog closes before upload starts
    setTimeout(() => {
      onApprove();
    }, 100);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  const insufficientFunds = cost && balance < cost.totalCostUSD;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Approve Batch Upload Payment
          </DialogTitle>
          <DialogDescription>
            Review the total cost for uploading {files.length} file{files.length > 1 ? 's' : ''} to Walrus
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
              {/* Batch Info */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
                <h4 className="mb-2 font-semibold text-sm">Batch Details</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Files:</span>
                    <span className="font-medium">{cost.fileCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Size:</span>
                    <span className="font-medium">{cost.totalSizeMB.toFixed(2)} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Storage:</span>
                    <span className="font-medium">{cost.storageDays} days</span>
                  </div>
                </div>
              </div>

              {/* Cost Info */}
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
                <h4 className="mb-2 font-semibold text-sm">Total Upload Cost</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost (USD):</span>
                    <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      ${cost.totalCostUSD.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cost (SUI):</span>
                    <span className="font-medium">≈ {cost.totalCostSUI.toFixed(10)} SUI</span>
                  </div>
                </div>
              </div>

              {/* Balance Info */}
              <div className={`rounded-lg border p-4 ${
                insufficientFunds
                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950'
                  : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
              }`}>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Your Balance:</span>
                  <span className="font-bold">${balance.toFixed(2)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">After Upload:</span>
                  <span className={`font-bold ${insufficientFunds ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    ${Math.max(0, balance - (cost?.totalCostUSD || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Insufficient Funds Warning */}
              {insufficientFunds && (
                <div className="rounded-lg bg-red-100 p-3 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                  <div className="flex gap-2">
                    <AlertCircle className="h-5 w-5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-semibold">Insufficient Balance</p>
                      <p className="mt-1">
                        You need ${(cost.totalCostUSD - balance).toFixed(2)} more to complete this batch upload.
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
              {loading ? 'Processing...' : `Approve & Upload ${files.length} File${files.length > 1 ? 's' : ''}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
