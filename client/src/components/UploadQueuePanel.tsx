import React, { useEffect, useState } from "react";
import { Trash2, Loader2, Clock, Upload } from "lucide-react";
import { useUploadQueue, QueuedUpload } from "../hooks/useUploadQueue";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";
import { BatchPaymentApprovalDialog } from "./BatchPaymentApprovalDialog";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadQueuePanel({ epochs }: { epochs: number }) {
  const { items, processQueue, processOne, remove, refresh } = useUploadQueue();
  const [showSinglePaymentDialog, setShowSinglePaymentDialog] = useState(false);
  const [showBatchPaymentDialog, setShowBatchPaymentDialog] = useState(false);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("upload-queue-updated", handler);
    return () => window.removeEventListener("upload-queue-updated", handler);
  }, [refresh]);

  const handleSingleUploadClick = (id: string) => {
    setPendingUploadId(id);
    setShowSinglePaymentDialog(true);
  };

  const handleSinglePaymentApproved = () => {
    if (pendingUploadId) {
      processOne(pendingUploadId);
      setPendingUploadId(null);
    }
  };

  const handleSinglePaymentCancelled = () => {
    setPendingUploadId(null);
  };

  const handleBatchUploadClick = () => {
    setShowBatchPaymentDialog(true);
  };

  const handleBatchPaymentApproved = () => {
    processQueue();
  };

  const handleBatchPaymentCancelled = () => {
    // Payment cancelled
  };

  const pendingFile = items.find(item => item.id === pendingUploadId);
  const queuedItems = items.filter(item => item.status === "queued");
  
  // Filter out completed uploads - they show in Recent Uploads instead
  const activeItems = items.filter(item => item.status !== "done");

  if (activeItems.length === 0) return null;

  return (
    <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
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
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              Upload All ({queuedItems.length})
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          {activeItems.map((i: any) => (
            <li
              key={i.id}
              className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
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
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Upload
                      </Button>
                    )}
                    {i.status !== "uploading" && (
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
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
                      style={{ width: `${i.progress || 0}%` }}
                    />
                  </div>
                )}

                {/* Error message */}
                {i.status === "error" && i.error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    {i.error}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
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
        files={queuedItems.map(item => ({
          id: item.id,
          filename: item.filename,
          size: item.size,
          epochs: item.epochs,
        }))}
        onApprove={handleBatchPaymentApproved}
        onCancel={handleBatchPaymentCancelled}
        currentEpochs={epochs}
      />
    </Card>
  );
}
