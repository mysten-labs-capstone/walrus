import React, { useState, useEffect, useRef } from "react";
import { DollarSign, AlertCircle, Loader2, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Slider } from "./ui/slider";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
  const lastFetchedRef = useRef<{ epochs: number; fileSize: number } | null>(
    null,
  );
  const user = authService.getCurrentUser();

  useEffect(() => {
    if (open && file && !isInitialized) {
      setSelectedEpochs(epochs);
      setTempEpochs(epochs);
      setIsInitialized(true);
      // Reset last fetched when dialog opens
      lastFetchedRef.current = null;
    } else if (!open) {
      setIsInitialized(false);
      lastFetchedRef.current = null;
    }
  }, [open, file, epochs, isInitialized]);

  useEffect(() => {
    if (open && file) {
      // Only fetch if we haven't fetched for this exact state
      if (
        !lastFetchedRef.current ||
        lastFetchedRef.current.epochs !== selectedEpochs ||
        lastFetchedRef.current.fileSize !== file.size
      ) {
        fetchCostAndBalance().then(() => {
          lastFetchedRef.current = {
            epochs: selectedEpochs,
            fileSize: file.size,
          };
        });
      } else {
        // We already have the cost for this state, don't show loading
        setLoading(false);
      }
    }
  }, [open, selectedEpochs, file?.size]);

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch cost
      const costResponse = await fetch(apiUrl("/api/payment/get-cost"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileSize: file.size, epochs: selectedEpochs }),
      });

      if (!costResponse.ok) {
        throw new Error("Failed to calculate cost");
      }

      const costData = await costResponse.json();

      // Fetch balance
      const balanceResponse = await fetch(
        apiUrl(`/api/payment/get-balance?userId=${user.id}`),
      );

      if (!balanceResponse.ok) {
        throw new Error("Failed to fetch balance");
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
      setError(err.message || "Failed to load payment information");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !cost) return;

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

  const handleDialogOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Dialog is closing - treat as cancel
      handleCancel();
    } else {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Approve Upload Payment
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Review the cost for uploading this file to Walrus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Info */}
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
            <h4 className="mb-2 font-semibold text-sm text-white">
              File Details
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Name:</span>
                <span className="font-medium text-white truncate ml-2 max-w-[200px]">
                  {file.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Size:</span>
                <span className="font-medium text-white">
                  {formatBytes(file.size)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Storage:</span>
                <span className="font-medium text-white">
                  {selectedEpochs * 14} days
                </span>
              </div>
            </div>
          </div>

          {/* Storage Duration Selector */}
          <div className="rounded-lg border-2 border-dashed border-emerald-700/50 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-sm text-white">
                <Clock className="h-4 w-4 inline mr-2 text-emerald-400" />
                Storage Duration
              </p>
              <span className="text-lg font-bold text-emerald-400">
                {tempEpochs * 14} days
              </span>
            </div>
            <Slider
              value={[tempEpochs]}
              onValueChange={(value: number[]) => {
                setTempEpochs(value[0]);
                setSelectedEpochs(value[0]);
              }}
              onValueCommit={(value: number[]) => setSelectedEpochs(value[0])}
              min={1}
              max={13}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-300 mt-2">
              <span>14 days</span>
              <span>182 days</span>
            </div>
            <p className="text-xs text-gray-300 mt-2 text-center">
              Select how long your file will be stored on Walrus network
            </p>
          </div>

          {/* Cost + Balance */}
          <div className="rounded-lg border-2 border-emerald-800/50 bg-emerald-950/30 p-4">
            <h4 className="mb-2 font-semibold text-sm text-white">
              Upload Cost
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Cost (USD):</span>
                <span className="text-xl font-bold text-emerald-400">
                  {loading || !cost ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                    </span>
                  ) : (
                    <>${cost.costUSD.toFixed(2)}</>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Cost (SUI):</span>
                <span className="font-medium text-white">
                  {loading || !cost ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                    </span>
                  ) : (
                    <>≈ {cost.costSUI.toFixed(3)} SUI</>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Balance Info */}
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-300">Your Balance:</span>
              <span className="font-bold text-white">
                ${balance.toFixed(2)}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-300">After Upload:</span>
              <span className="font-bold text-emerald-400">
                ${Math.max(0, balance - (cost?.costUSD || 0)).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Insufficient Funds Warning */}
          {/* Removed - insufficient funds are now checked earlier in UploadSection */}

          {/* Other Errors */}
          {!loading && error && (
            <div className="rounded-lg bg-red-100 p-3 text-red-800 dark:bg-red-900/50 dark:text-red-200">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
            className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={loading || !cost}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            <span className="relative inline-flex items-center justify-center">
              <span className="invisible">Approve & Upload</span>
              <span className="absolute inset-0 flex items-center justify-center">
                {loading ? "Processing..." : "Approve & Upload"}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
