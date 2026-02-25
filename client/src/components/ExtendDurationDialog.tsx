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
import { getBalance } from "../services/balanceService";
import { useDaysPerEpoch } from "../hooks/useDaysPerEpoch";

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
  const [tempDays, setTempDays] = useState<string>("0");
  const [isEditingDays, setIsEditingDays] = useState(false);
  const user = authService.getCurrentUser();
  const daysPerEpoch = useDaysPerEpoch();
  const epochDays = daysPerEpoch || 14;
  const maxAdditionalEpochs = Math.max(0, 53 - currentEpochs);
  const maxAdditionalDays = maxAdditionalEpochs * epochDays;
  const extensionDisabled = maxAdditionalEpochs === 0;
  const tempDaysNum = Number(tempDays);
  const isValidDays =
    !extensionDisabled &&
    tempDays !== "" &&
    Number.isFinite(tempDaysNum) &&
    tempDaysNum >= 0 &&
    tempDaysNum <= maxAdditionalDays;

  useEffect(() => {
    if (open) {
      if (maxAdditionalEpochs === 0) {
        setSelectedEpochs(0);
        setTempEpochs(0);
        setTempDays("0");
        return;
      }
      if (selectedEpochs > maxAdditionalEpochs) {
        setSelectedEpochs(maxAdditionalEpochs);
      }
      setTempEpochs(selectedEpochs);
      if (!isEditingDays) {
        setTempDays(String(selectedEpochs * epochDays));
      }
    }
  }, [open, selectedEpochs, maxAdditionalEpochs, epochDays, isEditingDays]);

  const fetchCost = async () => {
    if (!user) return;
    if (extensionDisabled) {
      setCost(null);
      return;
    }
    if (selectedEpochs <= 0) {
      setCost(null);
      return;
    }

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
        additionalDays: selectedEpochs * daysPerEpoch,
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
      const balanceValue = await getBalance(user.id);
      setBalance(balanceValue || 0);
    } catch (err: any) {
      setError(err.message || "Failed to fetch balance");
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      fetchBalance();
    }
  }, [open]);

  useEffect(() => {
    if (open && !extensionDisabled) {
      fetchCost();
    }
  }, [open, selectedEpochs, extensionDisabled]);

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
              Current storage: {currentEpochs * epochDays} days
            </p>
            <p className="text-xs text-emerald-300 mt-1">
              New expiration date: {new Date(
                Date.now() +
                  (currentEpochs + tempEpochs) *
                    epochDays *
                    24 *
                    60 *
                    60 *
                    1000,
              ).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Epoch Selection */}
          <div className="rounded-lg border-2 border-dashed border-emerald-700/50 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-white">
                Extension Duration
              </label>
              <span className="text-lg font-bold text-emerald-400">
                +{tempEpochs * epochDays} days
              </span>
            </div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <input
                type="number"
                value={tempDays}
                onFocus={() => setIsEditingDays(true)}
                onChange={(e) => {
                  if (maxAdditionalEpochs === 0) {
                    return;
                  }
                  const inputValue = e.target.value;
                  if (inputValue === "") {
                    setTempDays("");
                    setTempEpochs(0);
                    setSelectedEpochs(0);
                    return;
                  }
                  setTempDays(inputValue);
                  const rawDays = Number(inputValue);
                  if (!Number.isFinite(rawDays)) {
                    return;
                  }
                  const clampedDays = Math.min(
                    maxAdditionalDays,
                    Math.max(0, rawDays),
                  );
                  const epochs = clampedDays <= 0
                    ? 0
                    : Math.min(
                        maxAdditionalEpochs,
                        Math.max(1, Math.ceil(clampedDays / epochDays)),
                      );
                  setTempEpochs(epochs);
                  setSelectedEpochs(epochs);
                }}
                onBlur={() => {
                  setIsEditingDays(false);
                  if (maxAdditionalEpochs === 0) {
                    return;
                  }
                  if (tempDays === "") {
                    setTempDays("0");
                    setTempEpochs(0);
                    setSelectedEpochs(0);
                    return;
                  }
                  const rawDays = Number(tempDays);
                  const clampedDays = Math.min(
                    maxAdditionalDays,
                    Math.max(0, Number.isFinite(rawDays) ? rawDays : 0),
                  );
                  const epochs = clampedDays <= 0
                    ? 0
                    : Math.min(
                        maxAdditionalEpochs,
                        Math.max(1, Math.ceil(clampedDays / epochDays)),
                      );
                  setTempDays(String(clampedDays));
                  setTempEpochs(epochs);
                  setSelectedEpochs(epochs);
                }}
                className="w-24 h-10 px-3 border border-emerald-600/50 rounded bg-emerald-950 text-white text-center focus:outline-none focus:border-emerald-400"
                min="0"
                max={String(maxAdditionalDays)}
                disabled={maxAdditionalEpochs === 0}
              />
              <span className="text-xs text-gray-400">
                days (0-{maxAdditionalDays})
              </span>
            </div>
            {!extensionDisabled && !isValidDays && (
              <p className="text-center text-xs text-red-400">
                Please enter a valid duration (0-{maxAdditionalDays} days)
              </p>
            )}
            {maxAdditionalEpochs === 0 && (
              <p className="text-xs text-amber-300 text-center">
                Maximum storage duration reached (53 epochs).
              </p>
            )}
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
          </div>

          {/* Error Message */}
          {error && !extensionDisabled && (
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
              extensionDisabled ||
              !isValidDays ||
              selectedEpochs === 0 ||
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
