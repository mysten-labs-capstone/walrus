import React, { useState, useEffect, useRef, useMemo } from "react";
import { DollarSign, AlertCircle, Loader2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

export type BatchPaymentQuote = {
  quoteId: string;
  expiresAt: string;
  totalCostUSD: number;
  totalCostSUI: number;
  perFile: Array<{
    tempId: string;
    costUSD: number;
    costSUI: number;
    sizeInMB: string;
    storageDays: number;
    epochs: number;
  }>;
};

interface BatchPaymentApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: Array<{
    id: string;
    filename: string;
    size: number;
    paymentAmount?: number;
    epochs?: number;
    contentType?: string;
  }>;
  onApprove: (quote: BatchPaymentQuote, epochs: number) => void;
  onCancel: () => void;
  currentEpochs?: number;
}

interface TotalCostInfo {
  totalCostUSD: number;
  totalCostSUI: number;
  totalSizeBytes: number;
  fileCount: number;
  storageDays: number | string;
}

interface ExpirationInfo {
  expiresAt: string;
  formattedDate: string;
  daysUntilExpiration: number;
  epochs: number;
  epochDays: number;
}

export function BatchPaymentApprovalDialog({
  open,
  onOpenChange,
  files,
  onApprove,
  onCancel,
  currentEpochs,
}: BatchPaymentApprovalDialogProps) {
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<TotalCostInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [quote, setQuote] = useState<BatchPaymentQuote | null>(null);
  const [expiration, setExpiration] = useState<ExpirationInfo | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(14);
  const [tempDays, setTempDays] = useState<string>("14");
  const daysPerEpoch = useDaysPerEpoch();
  const epochDays = expiration?.epochDays || daysPerEpoch || 14;
  const maxDays = Math.max(1, Math.floor(epochDays * 53));
  const [isInitialized, setIsInitialized] = useState(false);
  const lastFetchedRef = useRef<{ epochs: number; filesHash: string } | null>(
    null,
  );
  const user = authService.getCurrentUser();
  const navigate = useNavigate();

  const calculateEpochs = (days: number): number => {
    const clampedDays = Math.max(1, Math.min(days, maxDays));
    return Math.min(53, Math.ceil(clampedDays / epochDays));
  };

  const selectedEpochs = calculateEpochs(selectedDays);
  const tempDaysNum = Number(tempDays) || 0;
  const tempEpochs = tempDaysNum > 0 ? calculateEpochs(tempDaysNum) : 0;
  const isValidDays = tempDaysNum >= 1 && tempDaysNum <= maxDays;

  const hasInsufficientBalance = useMemo(() => {
    if (loading || !cost) return false;
    return balance < cost.totalCostUSD;
  }, [balance, cost, loading]);

  useEffect(() => {
    if (open && files.length > 0 && !isInitialized) {
      const initialEpochs = Math.min(currentEpochs || 3, 53);
      const initialDays = Math.min(initialEpochs * epochDays, maxDays);
      setSelectedDays(initialDays);
      setTempDays(String(initialDays));
      setIsInitialized(true);
      setIsApproving(false);
      // Reset last fetched when dialog opens
      lastFetchedRef.current = null;
      setQuote(null);
      setCost(null);
      fetchEpochInfo();
    } else if (!open) {
      setIsInitialized(false);
      setIsApproving(false);
      lastFetchedRef.current = null;
      setQuote(null);
      setCost(null);
    }
  }, [open, isInitialized, currentEpochs, files.length, epochDays, maxDays]);

  useEffect(() => {
    if (selectedDays > maxDays) {
      setSelectedDays(maxDays);
      setTempDays(String(maxDays));
    }
  }, [maxDays, selectedDays]);

  // Create a stable files hash
  const filesHash = useMemo(() => {
    if (!files || files.length === 0) return "";
    return files.map((f) => `${f.id}-${f.size}`).join(",");
  }, [files]);

  useEffect(() => {
    if (open && files.length > 0) {
      // Only fetch if we haven't fetched for this exact state
      if (
        !lastFetchedRef.current ||
        lastFetchedRef.current.epochs !== selectedEpochs ||
        lastFetchedRef.current.filesHash !== filesHash
      ) {
        fetchCostAndBalance().then(() => {
          lastFetchedRef.current = { epochs: selectedEpochs, filesHash };
        });
      } else {
        // We already have the cost for this state, don't show loading
        setLoading(false);
      }
    }
  }, [open, selectedEpochs, filesHash]);

  const fetchEpochInfo = async () => {
    try {
      const expirationResponse = await fetch(apiUrl("/api/payment/calculate-expiration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epochs: 1 }),
      });

      if (expirationResponse.ok) {
        const expirationData = await expirationResponse.json();
        setExpiration(expirationData);
      } else {
        setExpiration({
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          formattedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString(
            "en-US",
            { month: "short", day: "numeric", year: "numeric" },
          ),
          daysUntilExpiration: 1,
          epochs: 1,
          epochDays: 1,
        });
      }
    } catch (err) {
      setExpiration({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        formattedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString(
          "en-US",
          { month: "short", day: "numeric", year: "numeric" },
        ),
        daysUntilExpiration: 1,
        epochs: 1,
        epochDays: 1,
      });
    }
  };

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // For batch uploads, we need to calculate cost per file since each is a separate transaction
      // Each transaction has its own gas overhead
      // Use currentEpochs if provided (from UI), otherwise use file's original epochs
      const batchResponse = await fetch(apiUrl("/api/payment/get-cost-batch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          files: files.map((file) => ({
            tempId: file.id,
            size: file.size,
            epochs: selectedEpochs ?? file.epochs,
            contentType: file.contentType,
          })),
        }),
      });

      if (!batchResponse.ok) {
        throw new Error("Failed to calculate batch cost");
      }

      const batchData = (await batchResponse.json()) as BatchPaymentQuote & {
        totalCost?: number;
      };

      const expirationResponse = await fetch(apiUrl("/api/payment/calculate-expiration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epochs: selectedEpochs }),
      });

      if (expirationResponse.ok) {
        const expirationData = await expirationResponse.json();
        setExpiration(expirationData);
      }

      const totalCostUSD =
        typeof batchData.totalCostUSD === "number"
          ? batchData.totalCostUSD
          : (batchData.totalCost ?? 0);
      const totalCostSUI = batchData.totalCostSUI ?? 0;
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);

      // Get storage days - check if all files have the same duration
      const storageDaysArray = batchData.perFile.map((r) => r.storageDays);
      const uniqueStorageDays = Array.from(new Set(storageDaysArray));
      let storageDaysDisplay: number | string = storageDaysArray[0] || 90;
      if (uniqueStorageDays.length > 1) {
        // Files have different durations, show the range
        storageDaysDisplay = `${Math.min(...storageDaysArray)}-${Math.max(...storageDaysArray)}`;
      }

      const costData = {
        costUSD: totalCostUSD,
        costSUI: totalCostSUI,
        sizeInMB: (totalSize / (1024 * 1024)).toFixed(2),
        storageDays: storageDaysDisplay,
      };

      // Fetch balance
      const balanceValue = await getBalance(user.id);

      setQuote(batchData);

      setCost({
        totalCostUSD: costData.costUSD,
        totalCostSUI: costData.costSUI,
        totalSizeBytes: totalSize,
        fileCount: files.length,
        storageDays: costData.storageDays,
      });
      setBalance(balanceValue || 0);
    } catch (err: any) {
      console.error(
        "[BatchPaymentApprovalDialog] Load payment info failed:",
        err,
      );
      setError("Failed to load payment information");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !cost || !quote) return;
    if (isApproving) return;
    setIsApproving(true);

    // Don't deduct payment upfront - each file upload will deduct individually
    // Just close the dialog and proceed
    onOpenChange(false);

    // Small delay to ensure dialog closes before upload starts
    setTimeout(() => {
      onApprove(quote, selectedEpochs);
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

  const handleAddFundsClick = () => {
    onCancel();
    onOpenChange(false);
    navigate("/payment");
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Approve Batch Upload Payment
          </DialogTitle>
          <DialogDescription className="text-gray-300">
            Review the total cost for uploading {files.length} file
            {files.length > 1 ? "s" : ""} to Walrus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Batch Info */}
          <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-4">
            <h4 className="mb-2 font-semibold text-sm text-white">
              Batch Details
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Files:</span>
                <span className="font-medium text-white">{files.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Total Size:</span>
                <span className="font-medium text-white">
                  {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Storage:</span>
                <span className="font-medium text-white">
                  {selectedDays} {selectedDays === 1 ? "day" : "days"} ({selectedEpochs} {selectedEpochs === 1 ? "epoch" : "epochs"})
                </span>
              </div>
            </div>
          </div>

          {/* Storage Duration Selector */}
          <div className="rounded-lg border-2 border-dashed border-emerald-700/50 bg-emerald-950/20 p-4">
            <div className="mb-3">
              <p className="font-semibold text-sm text-white">
                <Clock className="h-4 w-4 inline mr-2 text-emerald-400" />
                Storage Duration
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <Slider
                value={[tempDaysNum || 1]}
                onValueChange={(value: number[]) => {
                  setTempDays(String(value[0]));
                  setSelectedDays(value[0]);
                }}
                onValueCommit={(value: number[]) => setSelectedDays(value[0])}
                min={1}
                max={maxDays}
                step={1}
                className="flex-1"
              />
              <input
                type="number"
                value={tempDays}
                onChange={(e) => {
                  const inputValue = e.target.value;
                  if (inputValue === "") {
                    setTempDays("");
                    return;
                  }
                  setTempDays(inputValue);
                  const num = Number(inputValue);
                  if (num >= 1 && num <= maxDays) {
                    setSelectedDays(num);
                  }
                }}
                onBlur={() => {
                  if (tempDays === "" || tempDaysNum < 1 || tempDaysNum > maxDays) {
                    setTempDays(String(selectedDays));
                  }
                }}
                className={`w-16 h-10 px-2 border rounded bg-emerald-950 text-white text-center rounded-md focus:outline-none ${
                  isValidDays
                    ? "border-emerald-600/50 focus:border-emerald-400"
                    : "border-red-600/50 focus:border-red-400"
                }`}
                min={1}
                max={maxDays}
              />
              <span className="text-xs text-gray-400 whitespace-nowrap">days</span>
            </div>
            <div className="flex justify-between text-xs text-gray-300">
              <span>1 day</span>
              <span>{maxDays} days</span>
            </div>
            <div className="mt-3 space-y-1 text-xs text-emerald-300">
              {isValidDays ? (
                <>
                  <p className="text-center">
                    {tempDays} {tempDaysNum === 1 ? "day" : "days"} = {tempEpochs} {tempEpochs === 1 ? "epoch" : "epochs"}
                    {expiration && (
                      <span className="text-gray-400">
                        {" "}({epochDays} {epochDays === 1 ? "day" : "days"}/epoch)
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-center text-red-400">
                  Please enter a valid duration (1-{maxDays} days)
                </p>
              )}
            </div>
          </div>

          {/* Cost + Balance */}
          <div className="rounded-lg border-2 border-emerald-800/50 bg-emerald-950/30 p-4">
            <h4 className="mb-2 font-semibold text-sm text-white">
              Total Upload Cost
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
                    <>${cost.totalCostUSD.toFixed(2)}</>
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
                    <>≈ {cost.totalCostSUI.toFixed(3)} SUI</>
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
                ${Math.max(0, balance - (cost?.totalCostUSD || 0)).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Insufficient Funds Warning */}
          {hasInsufficientBalance && cost && (
            <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <div>
                  <p className="font-medium">Insufficient balance</p>
                  <p className="text-xs text-red-300">
                    Add ${Math.max(0, cost.totalCostUSD - balance).toFixed(2)}
                    to continue.
                  </p>
                </div>
              </div>
            </div>
          )}

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
            onClick={
              hasInsufficientBalance ? handleAddFundsClick : handleApprove
            }
            disabled={loading || !cost || isApproving || !isValidDays}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
          >
            <span className="relative inline-flex items-center justify-center">
              <span className="invisible">{`Approve & Upload`}</span>
              <span className="absolute inset-0 flex items-center justify-center">
                {isApproving
                  ? "Starting uploads..."
                  : loading
                    ? "Processing..."
                    : hasInsufficientBalance
                      ? "Add Funds"
                      : `Approve & Upload`}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
