import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Upload, Lock, LockOpen } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Card, CardContent, CardHeader } from "./ui/card";
import { Switch } from "./ui/switch";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";

type UploadSectionProps = {
  onUploaded?: (file: {
    blobId: string;
    file: File;
    encrypted: boolean;
    epochs?: number;
  }) => void;
  epochs: number;
  onEpochsChange: (epochs: number) => void;
  onFileQueued?: () => void;
  onSingleFileUploadStarted?: () => void;
};

export default function UploadSection({
  epochs,
  onFileQueued,
  onSingleFileUploadStarted,
}: UploadSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { privateKey, requestReauth } = useAuth();
  const { enqueue, processQueue } = useUploadQueue();
  const [encrypt, setEncrypt] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [pendingQueueFiles, setPendingQueueFiles] = useState<File[]>([]);

  const canEncrypt = useMemo(() => !!privateKey, [privateKey]);
  const paymentFile = useMemo(() => {
    if (selectedFiles.length === 0) return null;
    if (selectedFiles.length === 1) return selectedFiles[0];
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    return {
      name: `${selectedFiles.length} files`,
      size: totalSize,
    } as File;
  }, [selectedFiles]);

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  // Resume pending files after reauth succeeds
  useEffect(() => {
    if (pendingQueueFiles.length > 0 && privateKey) {
      setSelectedFiles(pendingQueueFiles);
      setPendingQueueFiles([]);
      setShowPaymentDialog(true);
    }
  }, [pendingQueueFiles, privateKey]);

  const pickFile = useCallback(() => {
    // If encryption is enabled but key is missing, request reauth first
    if (encrypt && !privateKey) {
      requestReauth();
      return;
    }
    inputRef.current?.click();
  }, [encrypt, privateKey, requestReauth]);

  // Listen for global "open-upload-picker" events (triggered when navigating from other pages)
  useEffect(() => {
    const handler = () => pickFile();
    window.addEventListener("open-upload-picker", handler);
    return () => window.removeEventListener("open-upload-picker", handler);
  }, [pickFile]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);

      // Check file size limit (100MB max to prevent server OOM)
      const oversizedFiles = fileArray.filter((f) => f.size > MAX_FILE_SIZE);
      if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map((f) => f.name).join(", ");
        setFileSizeError(
          `File(s) exceed maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB: ${fileNames}`,
        );
        if (e.target) e.target.value = "";
        return;
      }

      // Clear any previous error
      setFileSizeError(null);

      // If multiple files, open payment dialog and start uploads after approval
      if (fileArray.length > 1) {
        // Check if encryption is enabled but key is missing
        if (encrypt && !privateKey) {
          setPendingQueueFiles(fileArray);
          requestReauth();
          if (e.target) e.target.value = "";
          return;
        }

        setSelectedFiles(fileArray);
        setShowPaymentDialog(true);
        if (e.target) e.target.value = "";
      } else {
        // Single file - open the payment flow immediately
        setSelectedFiles(fileArray);
        setShowPaymentDialog(true);
      }
    },
    [encrypt, privateKey, requestReauth],
  );

  const handlePaymentApproved = useCallback(
    async (costUSD: number, selectedEpochs: number) => {
      if (selectedFiles.length === 0) return;

      const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
      for (const file of selectedFiles) {
        const share = totalSize > 0 ? file.size / totalSize : 0;
        const perFileCost = costUSD * share;
        await enqueue(file, encrypt, perFileCost, selectedEpochs);
      }
      setSelectedFiles([]);
      processQueue();
      onFileQueued?.();
      onSingleFileUploadStarted?.();
    },
    [
      selectedFiles,
      encrypt,
      onSingleFileUploadStarted,
      enqueue,
      processQueue,
      onFileQueued,
    ],
  );

  const handlePaymentCancelled = useCallback(() => {
    // User cancelled payment - clear selection so they can pick another file
    setShowPaymentDialog(false);
    setSelectedFiles([]);
    // Also reset the file input value so the same file can be selected again
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <Card className="relative overflow-hidden border-zinc-800 bg-black">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div></div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Encryption Toggle */}
        <div className="rounded-lg border-2 border-dashed border-zinc-700/50 p-4 hover:bg-zinc-800 transition-colors text-gray-300 hover:text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {encrypt ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 shadow-md">
                  <Lock className="h-5 w-5 text-emerald-400" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 shadow-md">
                  <LockOpen className="h-5 w-5 text-amber-400" />
                </div>
              )}
              <div>
                <p className="font-semibold text-sm text-white">
                  {encrypt ? "Encryption Enabled" : "Encryption Disabled"}
                </p>
                <p className="text-xs text-gray-300">
                  {encrypt
                    ? "Files will be encrypted before upload"
                    : "Files will be uploaded without encryption"}
                </p>
              </div>
            </div>
            <Switch
              checked={encrypt}
              onCheckedChange={setEncrypt}
              disabled={showPaymentDialog}
            />
          </div>
        </div>

        {/* Upload Area */}
        <div
          onClick={pickFile}
          onDragEnter={(e) => {
            e.preventDefault();
            // Prevent drag if encryption is on but no key
            if (encrypt && !privateKey) {
              requestReauth();
              return;
            }
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            // Prevent drag if encryption is on but no key
            if (encrypt && !privateKey) {
              return;
            }
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={async (e) => {
            e.preventDefault();
            setDragActive(false);

            // Check if encryption is enabled but key is missing
            if (encrypt && !privateKey) {
              requestReauth();
              return;
            }

            const dt = e.dataTransfer;
            if (!dt) return;
            const files = Array.from(dt.files || []);
            if (files.length === 0) return;

            // Check file size limit
            const oversizedFiles = files.filter((f) => f.size > MAX_FILE_SIZE);
            if (oversizedFiles.length > 0) {
              const fileNames = oversizedFiles.map((f) => f.name).join(", ");
              setFileSizeError(
                `File(s) exceed maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB: ${fileNames}`,
              );
              return;
            }

            // Clear any previous error
            setFileSizeError(null);

            // If multiple files, open payment dialog and start uploads after approval
            if (files.length > 1) {
              if (encrypt && !privateKey) {
                setPendingQueueFiles(files);
                requestReauth();
                return;
              }
              setSelectedFiles(files);
              setShowPaymentDialog(true);
            } else {
              // Single file - open payment flow immediately
              setSelectedFiles(files);
              setShowPaymentDialog(true);
            }
          }}
          className={`group relative overflow-hidden rounded-xl border-2 border-dashed p-12 text-center transition-all ${
            encrypt && !privateKey
              ? "cursor-not-allowed border-gray-700 bg-gray-900/50 opacity-60"
              : "cursor-pointer hover:border-zinc-700 hover:bg-zinc-800/10 text-gray-300 hover:text-white"
          } ${
            dragActive
              ? "border-zinc-700 bg-zinc-800/10 shadow-inner"
              : "border-zinc-800/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 shadow-lg transition-transform group-hover:scale-110">
              {encrypt && !privateKey ? (
                <Lock className="h-8 w-8 text-emerald-400" />
              ) : (
                <Upload className="h-8 w-8 text-emerald-400" />
              )}
            </div>
            <div>
              {encrypt && !privateKey ? (
                <>
                  <p className="text-lg font-semibold text-gray-300">
                    Authentication Required
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    Click here to authenticate and enable encrypted uploads
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-white">
                    Click or drag files here to upload
                  </p>
                  <p className="mt-1 text-sm text-gray-300">
                    Drop multiple files to queue them automatically
                  </p>
                </>
              )}
              <p className="mt-2 text-xs text-gray-400">
                Max File Size: <span className="font-medium">100 MB</span>
              </p>
            </div>
          </div>
        </div>

        {/* Selected File UI */}
        {/* Hide when payment dialog is open */}
        {fileSizeError && !showPaymentDialog && (
          <div className="animate-slide-up rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950/50">
            <p className="text-sm text-red-700 dark:text-red-400">
              {fileSizeError}
            </p>
          </div>
        )}

        {/* Active Upload Status UI hidden */}
      </CardContent>

      {/* Payment Approval Dialog */}
      {paymentFile && (
        <PaymentApprovalDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          file={paymentFile}
          onApprove={handlePaymentApproved}
          onCancel={handlePaymentCancelled}
          epochs={epochs}
        />
      )}
    </Card>
  );
}
