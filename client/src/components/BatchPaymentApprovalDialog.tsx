import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { getBalance } from "../services/balanceService";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface BatchPaymentApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: Array<{
    id: string;
    filename: string;
    size: number;
    paymentAmount?: number;
    epochs?: number;
  }>;
  onApprove: (epochs: number) => void;
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
  const [selectedEpochs, setSelectedEpochs] = useState<number>(
    currentEpochs || 3,
  );
  const [tempEpochs, setTempEpochs] = useState<number>(currentEpochs || 3);
  const [isInitialized, setIsInitialized] = useState(false);
  const lastFetchedRef = useRef<{ epochs: number; filesHash: string } | null>(
    null,
  );
  const user = authService.getCurrentUser();

  useEffect(() => {
    if (open && files.length > 0 && !isInitialized) {
      setSelectedEpochs(currentEpochs || 3);
      setTempEpochs(currentEpochs || 3);
      setIsInitialized(true);
      // Reset last fetched when dialog opens
      lastFetchedRef.current = null;
    } else if (!open) {
      setIsInitialized(false);
      lastFetchedRef.current = null;
    }
  }, [open, isInitialized, currentEpochs, files.length]);

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

  const fetchCostAndBalance = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);

    try {
      // For batch uploads, we need to calculate cost per file since each is a separate transaction
      // Each transaction has its own gas overhead
      // Use currentEpochs if provided (from UI), otherwise use file's original epochs
      const costPromises = files.map((file) =>
        fetch(apiUrl("/api/payment/get-cost"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileSize: file.size,
            epochs: selectedEpochs ?? file.epochs,
          }),
        }).then((r) => r.json()),
      );

      const costResults = await Promise.all(costPromises);

      // Sum up all costs
      const totalCostUSD = costResults.reduce(
        (sum, data) => sum + data.costUSD,
        0,
      );
      const totalCostSUI = costResults.reduce(
        (sum, data) => sum + data.costSUI,
        0,
      );
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);

      // Get storage days - check if all files have the same duration
      const storageDaysArray = costResults.map((r) => r.storageDays);
      const uniqueStorageDays = Array.from(new Set(storageDaysArray));
      let storageDaysDisplay = storageDaysArray[0] || 90;
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
    if (!user || !cost) return;

    // Don't deduct payment upfront - each file upload will deduct individually
    // Just close the dialog and proceed
    onOpenChange(false);

    // Small delay to ensure dialog closes before upload starts
    setTimeout(() => {
      onApprove(selectedEpochs);
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
              Select how long your files will be stored on Walrus network
            </p>
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
              <span className="invisible">{`Approve & Upload`}</span>
              <span className="absolute inset-0 flex items-center justify-center">
                {loading ? "Processing..." : `Approve & Upload`}
              </span>
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
