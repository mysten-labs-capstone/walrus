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

interface ExpirationInfo {
  expiresAt: string;
  formattedDate: string;
  daysUntilExpiration: number;
  epochs: number;
  epochDays: number;
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
  console.log("[PaymentApprovalDialog] Rendered with open:", open, "file:", file?.name);
  const [balance, setBalance] = useState<number>(0);
  const [cost, setCost] = useState<CostInfo | null>(null);
  const [expiration, setExpiration] = useState<ExpirationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(14);
  const [tempDays, setTempDays] = useState<string>('14');
  const [isInitialized, setIsInitialized] = useState(false);
  const daysPerEpoch = useDaysPerEpoch();
  const epochDays = expiration?.epochDays || daysPerEpoch || 14;
  const maxDays = Math.max(1, Math.floor(epochDays * 53));
  const lastFetchedRef = useRef<{ epochs: number; fileSize: number } | null>(
    null,
  );
  const user = authService.getCurrentUser();

  // Calculate epochs from days using the actual epoch duration from the network
  const calculateEpochs = (days: number): number => {
    const clampedDays = Math.max(1, Math.min(days, maxDays));
    return Math.min(53, Math.ceil(clampedDays / epochDays));
  };

  const selectedEpochs = calculateEpochs(selectedDays);
  const tempDaysNum = Number(tempDays) || 0;
  const tempEpochs = tempDaysNum > 0 ? calculateEpochs(tempDaysNum) : 0;
  const isValidDays = tempDaysNum >= 1 && tempDaysNum <= maxDays;

  useEffect(() => {
    if (open && file && !isInitialized) {
      const initialEpochs = Math.min(epochs, 53);
      const initialDays = Math.min(initialEpochs * epochDays, maxDays);
      setSelectedDays(initialDays);
      setTempDays(String(initialDays));
      setIsInitialized(true);
      // Reset last fetched when dialog opens
      lastFetchedRef.current = null;
      // Fetch epoch info early to get the correct epoch duration
      fetchEpochInfo();
    } else if (!open) {
      setIsInitialized(false);
      lastFetchedRef.current = null;
    }
  }, [open, file, isInitialized, epochs, epochDays, maxDays]);

  useEffect(() => {
    if (selectedDays > maxDays) {
      setSelectedDays(maxDays);
      setTempDays(String(maxDays));
    }
  }, [maxDays, selectedDays]);

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

  const fetchEpochInfo = async () => {
    try {
      console.log('[PaymentDialog] Fetching epoch info from:', apiUrl("/api/payment/calculate-expiration"));
      // Fetch epoch info to get the correct epoch duration for the network
      const expirationResponse = await fetch(apiUrl("/api/payment/calculate-expiration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epochs: 1 }),
      });

      if (expirationResponse.ok) {
        const expirationData = await expirationResponse.json();
        console.log('[PaymentDialog] Epoch info received:', expirationData);
        setExpiration(expirationData);
      } else {
        console.error('[PaymentDialog] Failed to fetch epoch info, status:', expirationResponse.status);
        const errorText = await expirationResponse.text();
        console.error('[PaymentDialog] Error response:', errorText);
        // Set fallback for testnet (1 day per epoch)
        setExpiration({
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          formattedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          daysUntilExpiration: 1,
          epochs: 1,
          epochDays: 1, // Testnet default
        });
      }
    } catch (err) {
      console.error("[PaymentDialog] Failed to fetch epoch info:", err);
      // Set fallback for testnet (1 day per epoch)
      setExpiration({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        formattedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        daysUntilExpiration: 1,
        epochs: 1,
        epochDays: 1, // Testnet default
      });
    }
  };

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

      // Fetch expiration date for the selected epochs
      const expirationResponse = await fetch(apiUrl("/api/payment/calculate-expiration"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ epochs: selectedEpochs }),
      });

      let expirationData: ExpirationInfo | null = null;
      if (expirationResponse.ok) {
        expirationData = await expirationResponse.json();
      }

      // Fetch balance
      const balanceValue = await getBalance(user.id);

      setCost({
        costUSD: costData.costUSD,
        costSUI: costData.costSUI,
        sizeInMB: costData.sizeInMB,
        storageDays: costData.storageDays,
      });
      if (expirationData) {
        setExpiration(expirationData);
      }
      setBalance(balanceValue || 0);
    } catch (err: any) {
      setError(err.message || "Failed to load payment information");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!user || !cost || !isValidDays) return;

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
                  {selectedDays} {selectedDays === 1 ? 'day' : 'days'} ({selectedEpochs} {selectedEpochs === 1 ? 'epoch' : 'epochs'})
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
                  // Allow empty string for deletion
                  if (inputValue === '') {
                    setTempDays('');
                    return;
                  }
                  // Update tempDays with the raw input
                  setTempDays(inputValue);
                  // Only update selectedDays if valid
                  const num = Number(inputValue);
                  if (num >= 1 && num <= maxDays) {
                    setSelectedDays(num);
                  }
                }}
                onBlur={() => {
                  // On blur, if empty or invalid, reset to last valid value
                  if (tempDays === '' || tempDaysNum < 1 || tempDaysNum > maxDays) {
                    setTempDays(String(selectedDays));
                  }
                }}
                className={`w-16 h-10 px-2 border rounded bg-emerald-950 text-white text-center rounded-md focus:outline-none ${
                  isValidDays
                    ? 'border-emerald-600/50 focus:border-emerald-400'
                    : 'border-red-600/50 focus:border-red-400'
                }`}
                min="1"
                max={String(maxDays)}
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
                    {tempDays} {tempDaysNum === 1 ? 'day' : 'days'} = {tempEpochs} {tempEpochs === 1 ? 'epoch' : 'epochs'}
                    {expiration && (
                      <span className="text-gray-400"> ({epochDays} {epochDays === 1 ? 'day' : 'days'}/epoch)</span>
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
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  </span>
                ) : (
                  `$${balance.toFixed(2)}`
                )}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-300">After Upload:</span>
              <span className="font-bold text-emerald-400">
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  </span>
                ) : (
                  `$${Math.max(0, balance - (cost?.costUSD || 0)).toFixed(2)}`
                )}
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
            disabled={loading || !cost || !isValidDays}
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
