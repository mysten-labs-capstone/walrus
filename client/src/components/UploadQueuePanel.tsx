import React, { useEffect, useState } from "react";
import { Trash2, Loader2, Clock, Upload } from "lucide-react";
import { useUploadQueue, QueuedUpload } from "../hooks/useUploadQueue";
import { useAuth } from "../auth/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";
import { BatchPaymentApprovalDialog } from "./BatchPaymentApprovalDialog";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Component to show retry countdown
function RetryCountdown({ retryAfter, retryCount, maxRetries }: { retryAfter?: number; retryCount?: number; maxRetries?: number }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!retryAfter) {
      setSecondsLeft(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((retryAfter - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  if (secondsLeft === null) return null;

  return (
    <span className="text-amber-600 dark:text-amber-400">
      Retrying in {secondsLeft}s (attempt {retryCount || 0}/{maxRetries || 3})
    </span>
  );
}

export default function UploadQueuePanel({ epochs, onUploadClick }: { epochs: number; onUploadClick?: () => void }) {
  const {
    items,
    processQueue,
    processOne,
    remove,
    refresh,
    updateQueuedEpochs,
    updateItemEpochs,
  } = useUploadQueue();
  const { privateKey, requestReauth } = useAuth();
  const [showSinglePaymentDialog, setShowSinglePaymentDialog] = useState(false);
  const [showBatchPaymentDialog, setShowBatchPaymentDialog] = useState(false);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [batchPaymentEpochs, setBatchPaymentEpochs] = useState(epochs);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("upload-queue-updated", handler);
    
    // Also refresh periodically to catch status changes (every 3 seconds)
    // This ensures we catch errors even if events are missed
    const interval = setInterval(() => {
      refresh();
    }, 3000);
    
    return () => {
      window.removeEventListener("upload-queue-updated", handler);
      clearInterval(interval);
    };
  }, [refresh]);

  const handleSingleUploadClick = (id: string) => {
    // Check if the file is encrypted and we don't have a key
    const file = items.find((item) => item.id === id);
    if (file?.encrypt && !privateKey) {
      requestReauth(() => {
        setPendingUploadId(id);
        setShowSinglePaymentDialog(true);
      });
      return;
    }

    setPendingUploadId(id);
    setShowSinglePaymentDialog(true);
  };

  const handleSinglePaymentApproved = async (
    costUSD: number,
    selectedEpochs: number,
  ) => {
    if (pendingUploadId) {
      await updateItemEpochs(pendingUploadId, selectedEpochs);
      processOne(pendingUploadId);
      setPendingUploadId(null);
    }
  };

  const handleRetryClick = async (id: string) => {
    // Reset retry count and status for manual retry
    const file = items.find((item) => item.id === id);
    
    if (file && (file.status === "error" || file.error)) {
      // For manual retry, we can skip payment dialog if it was already approved
      // Just retry the upload directly
      await processOne(id);
    }
  };

  const handleSinglePaymentCancelled = () => {
    setPendingUploadId(null);
  };

  const handleBatchUploadClick = () => {
    // Check if any queued files are encrypted and we don't have a key
    const encryptedFiles = queuedItems.filter((item) => item.encrypt);
    if (encryptedFiles.length > 0 && !privateKey) {
      requestReauth(() => {
        setShowBatchPaymentDialog(true);
      });
      return;
    }

    setShowBatchPaymentDialog(true);
  };

  const handleBatchPaymentApproved = async (selectedEpochs: number) => {
    setBatchPaymentEpochs(selectedEpochs);
    await updateQueuedEpochs(selectedEpochs);
    processQueue();
  };

  const handleBatchPaymentCancelled = () => {
    // Payment cancelled
  };

  const pendingFile = items.find((item) => item.id === pendingUploadId);
  const queuedItems = items.filter((item) => item.status === "queued");

  // Filter out completed uploads - they show in Recent Uploads instead
  const activeItems = items.filter((item) => item.status !== "done");

  return (
    <Card className="border-emerald-800/50 bg-emerald-950/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            Pending Uploads ({activeItems.length})
          </CardTitle>
          {queuedItems.length > 0 && (
            <Button
              onClick={handleBatchUploadClick}
              size="sm"
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              Upload All ({queuedItems.length})
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {activeItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
              <Upload className="h-12 w-12 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Upload Queue is Empty</h3>
            <p className="text-gray-200 max-w-md mb-6">
              Your upload queue is empty. Upload files to see them here with their upload status.
            </p>
            {onUploadClick && (
              <Button
                onClick={onUploadClick}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Files
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {activeItems.map((i: any) => {
              // Determine if we should show retry button
              // Show retry if: status is error, OR has error message and not in active states
              const hasError = !!i.error;
              const isActiveState = i.status === "uploading" || i.status === "retrying" || i.status === "done";
              const shouldShowRetry = i.status === "error" || (hasError && !isActiveState);
              
              return (
            <li
              key={i.id}
              className="rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 shadow-sm"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {i.filename}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                      {formatBytes(i.size)} •
                      {i.status === "uploading" ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin inline-block ml-1" />
                          <span className="ml-1">uploading</span>
                        </>
                      ) : i.status === "retrying" ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin inline-block ml-1 text-amber-600 dark:text-amber-400" />
                          <RetryCountdown retryAfter={i.retryAfter} retryCount={i.retryCount} maxRetries={i.maxRetries} />
                        </>
                      ) : (
                        i.status
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {i.status === "queued" && (
                      <Button
                        size="sm"
                        onClick={() => handleSingleUploadClick(i.id)}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Upload
                      </Button>
                    )}
                    {/* Show retry button for error status, or if there's an error message */}
                    {(shouldShowRetry || i.error) && i.status !== "uploading" && i.status !== "retrying" && i.status !== "done" && (
                      <Button
                        size="sm"
                        onClick={() => handleRetryClick(i.id)}
                        className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                    {i.status !== "uploading" && i.status !== "retrying" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(i.id)}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Progress bar for uploading/done items */}
                {(i.status === "uploading" || i.status === "done") && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-300"
                      style={{ width: `${i.progress || 0}%` }}
                    />
                  </div>
                )}

                {/* Retrying status */}
                {i.status === "retrying" && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-400">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <div>
                        <div className="font-medium">Retrying upload...</div>
                        {i.error && (
                          <div className="text-xs mt-1 opacity-75">{i.error}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Error message - show if status is error OR if there's an error field */}
                {(i.status === "error" || (i.error && i.status !== "uploading" && i.status !== "retrying" && i.status !== "done")) && i.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    {i.error}
                  </div>
                )}
              </div>
            </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {/* Single File Payment Dialog */}
      {pendingFile && (
        <PaymentApprovalDialog
          open={showSinglePaymentDialog}
          onOpenChange={setShowSinglePaymentDialog}
          file={{ name: pendingFile.filename, size: pendingFile.size } as File}
          onApprove={handleSinglePaymentApproved}
          onCancel={handleSinglePaymentCancelled}
          epochs={pendingFile.epochs}
        />
      )}

      {/* Batch Upload Payment Dialog */}
      <BatchPaymentApprovalDialog
        open={showBatchPaymentDialog}
        onOpenChange={setShowBatchPaymentDialog}
        files={queuedItems.map((item) => ({
          id: item.id,
          filename: item.filename,
          size: item.size,
          epochs: item.epochs,
        }))}
        onApprove={handleBatchPaymentApproved}
        onCancel={handleBatchPaymentCancelled}
        currentEpochs={batchPaymentEpochs}
      />
    </Card>
  );
}
