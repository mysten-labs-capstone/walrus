import React, { useState, useEffect } from "react";
import {
  DollarSign,
  AlertCircle,
  Loader2,
  Clock,
  CalendarPlus,
} from "lucide-react";
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
  const [loadingCost, setLoadingCost] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);
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

  const fetchCost = async () => {
    if (!user) return;

    setLoadingCost(true);
    setError(null);

    try {
      // Call the cost preview endpoint
      const costResponse = await fetch(
        apiUrl("/api/payment/extend-duration-cost"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileSize,
            additionalEpochs: selectedEpochs,
          }),
        },
      );

      if (!costResponse.ok) {
        throw new Error("Failed to calculate cost");
      }

      const costData = await costResponse.json();

      setCost({
        costUSD: costData.costUSD,
        costSUI: costData.costSUI,
        additionalDays: selectedEpochs * 14,
        additionalEpochs: selectedEpochs,
      });
    } catch (err: any) {
      setError(err.message || "Failed to load cost information");
    } finally {
      setLoadingCost(false);
    }
  };

  const fetchBalance = async () => {
    if (!user) return;

    setLoadingBalance(true);
    setError(null);

    try {
      const balanceResponse = await fetch(
        apiUrl(`/api/payment/get-balance?userId=${user.id}`),
      );

      if (!balanceResponse.ok) {
        throw new Error("Failed to fetch balance");
      }

      const balanceData = await balanceResponse.json();

      setBalance(balanceData.balance || 0);
    } catch (err: any) {
      setError(err.message || "Failed to fetch balance");
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchBalance();
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      fetchCost();
    }
  }, [open, selectedEpochs]);

  const handleExtend = async () => {
    if (!user || !cost) return;

    // Check if user has sufficient balance
    if (balance < cost.costUSD) {
      setError("Insufficient balance. Please add funds to your account.");
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/payment/extend-duration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          blobId,
          additionalEpochs: selectedEpochs,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to extend storage duration");
      }

      const data = await response.json();

      // Update balance
      setBalance(data.newBalance);

      // Call success callback
      onSuccess();

      // Close dialog
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || "Failed to extend storage duration");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <CalendarPlus className="h-5 w-5 text-emerald-400" />
            Extend Storage Duration
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Add more time to keep your file stored on Walrus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Info */}
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-3">
            <p className="text-sm font-semibold text-white truncate">
              {fileName}
            </p>
            <p className="text-xs text-gray-300 mt-1">
              {formatBytes(fileSize)}
            </p>
            <p className="text-xs text-gray-300">
              Current storage: {currentEpochs * 14} days
            </p>
          </div>

          {/* Epoch Selection */}
          <div className="rounded-lg border-2 border-dashed border-emerald-700/50 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-white">
                Extension Duration
              </label>
              <span className="text-lg font-bold text-emerald-400">
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
            <div className="flex justify-between text-xs text-gray-300 mt-2">
              <span>14 days</span>
              <span>182 days</span>
            </div>
          </div>

          {/* Cost Display */}
          <div className="space-y-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">
                Extension Cost:
              </span>
              <div className="text-right flex items-center gap-2">
                <div>
                  <div className="text-lg font-bold text-emerald-400">
                    ${cost?.costUSD?.toFixed(2) ?? "0.00"} USD
                  </div>
                  <div className="text-xs text-gray-300">
                    ≈ {cost?.costSUI?.toFixed(4) ?? "0.00"} SUI
                  </div>
                </div>
                {loadingCost && (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-emerald-800/50 pt-2">
              <span className="text-sm font-medium text-gray-300">
                Your Balance:
              </span>
              <span
                className={`text-sm font-semibold flex items-center gap-2 ${balance >= (cost?.costUSD ?? 0) ? "text-emerald-400" : "text-red-400"}`}
              >
                ${balance.toFixed(2)} USD
                {loadingBalance && (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                )}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-emerald-800/50 pt-2">
              <span className="text-sm font-medium text-gray-300">
                Additional Time:
              </span>
              <span className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                +{cost?.additionalDays ?? selectedEpochs * 14} days
                {loadingCost && (
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                )}
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-800/50 bg-red-950/30 p-3">
              <AlertCircle className="h-4 w-4 text-red-400 mt-0.5" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
            className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExtend}
            disabled={
              loadingCost ||
              loadingBalance ||
              processing ||
              !cost ||
              balance < (cost?.costUSD || 0)
            }
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
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
