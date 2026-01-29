import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Trash2, Upload, Lock, LockOpen, FileUp, Clock } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useSingleFileUpload } from "../hooks/useSingleFileUpload";
import { useUploadQueue } from "../hooks/useUploadQueue";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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
};

export default function UploadSection({
  onUploaded,
  epochs,
  onEpochsChange,
  onFileQueued,
}: UploadSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { privateKey, requestReauth } = useAuth();
  const { enqueue } = useUploadQueue();
  const { state, startUpload, reset } = useSingleFileUpload(onUploaded);
  const [encrypt, setEncrypt] = useState(true);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [pendingQueueFiles, setPendingQueueFiles] = useState<File[]>([]);

  const canEncrypt = useMemo(() => !!privateKey, [privateKey]);
  const selectedFile = selectedFiles.length === 1 ? selectedFiles[0] : null;

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

  // Queue pending files after reauth succeeds
  useEffect(() => {
    if (pendingQueueFiles.length > 0 && privateKey) {
      const queueFiles = async () => {
        for (const file of pendingQueueFiles) {
          await enqueue(file, encrypt, undefined, epochs);
        }
        setShowToast(`⏰ ${pendingQueueFiles.length} files queued`);
        setTimeout(() => setShowToast(null), 2500);
        setPendingQueueFiles([]);
        // Redirect to upload queue
        onFileQueued?.();
      };
      queueFiles();
    }
  }, [pendingQueueFiles, privateKey, enqueue, encrypt, epochs, onFileQueued]);

  useEffect(() => {
    if (state.status === "done") {
      setShowToast("✅ Upload complete");
      // Clear the hidden file input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
      const timer = setTimeout(() => {
        setShowToast(null);
        reset();
        setSelectedFiles([]);
      }, 500);
      return () => clearTimeout(timer);
    }

    if (state.status === "error") {
      // Immediately clear selection so input change will fire for the same file
      if (inputRef.current) inputRef.current.value = "";
      setSelectedFiles([]);
      // Show a brief toast with the error, then reset upload state to idle
      setShowToast(state.error || "Upload failed");
      const errTimer = setTimeout(() => {
        setShowToast(null);
        reset();
      }, 800);
      return () => clearTimeout(errTimer);
    }
  }, [state.status, reset]);

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

      // If multiple files, automatically queue them
      if (fileArray.length > 1) {
        // Check if encryption is enabled but key is missing
        if (encrypt && !privateKey) {
          setPendingQueueFiles(fileArray);
          requestReauth();
          if (e.target) e.target.value = "";
          return;
        }

        for (const file of fileArray) {
          await enqueue(file, encrypt, undefined, epochs);
        }
        setShowToast(`⏰ ${fileArray.length} files queued`);
        setTimeout(() => setShowToast(null), 2500);
        // Clear the input
        if (e.target) e.target.value = "";
        // Redirect to upload queue
        onFileQueued?.();
      } else {
        // Single file - open the payment flow immediately
        setSelectedFiles(fileArray);
        setShowPaymentDialog(true);
      }
    },
    [enqueue, encrypt, epochs],
  );

  const handlePaymentApproved = useCallback(
    (costUSD: number, selectedEpochs: number) => {
      if (!selectedFile) return;
      // Use privateKey if available (for Session Signer), otherwise empty string (backend will use master key)
      startUpload(
        selectedFile,
        privateKey || "",
        encrypt,
        costUSD,
        selectedEpochs,
      );
      setSelectedFiles([]);
      // Redirect to upload queue after starting upload
      onFileQueued?.();
    },
    [selectedFile, privateKey, encrypt, startUpload, onFileQueued],
  );

  const handlePaymentCancelled = useCallback(() => {
    // User cancelled payment - clear selection so they can pick another file
    setShowPaymentDialog(false);
    setSelectedFiles([]);
  }, []);

  return (
    <Card className="relative overflow-hidden border-zinc-800 bg-black">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
          </div>
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
              disabled={state.status !== "idle"}
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

            // If multiple files, queue them; otherwise show single-file UI
            if (files.length > 1) {
              for (const f of files) {
                await enqueue(f, encrypt, undefined, epochs);
              }
              setShowToast(`⏰ ${files.length} files queued`);
              setTimeout(() => setShowToast(null), 2500);
              // Redirect to upload queue
              onFileQueued?.();
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
        {fileSizeError && (
          <div className="animate-slide-up rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950/50">
            <p className="text-sm text-red-700 dark:text-red-400">
              {fileSizeError}
            </p>
          </div>
        )}

        {selectedFile && state.status === "idle" && (
          <div className="animate-slide-up space-y-3 rounded-xl border border-zinc-800/50 p-4 shadow-sm text-gray-300">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-white">{selectedFile.name}</p>
                <p className="mt-1 text-sm text-gray-300">{formatBytes(selectedFile.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedFiles([]);
                  setShowPaymentDialog(false);
                }}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-sm text-gray-300">Proceeding to payment…</div>
          </div>
        )}

        {/* Active Upload Status UI */}
        {/* Always show errors when present so validation failures are visible */}
        {state.status === "error" && state.error && (
          <div className="animate-slide-up space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            {state.error}
          </div>
        )}

        {state.file && state.status !== "idle" && (
          <div className="animate-slide-up space-y-3 rounded-xl border border-zinc-800/50 bg-zinc-900/20 p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {state.file.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatBytes(state.file.size)} • {state.status}
                </p>
              </div>
              {state.status !== "done" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all duration-300"
                style={{ width: `${state.progress}%` }}
              />
            </div>

            {/* Error */}
            {state.status === "error" && state.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                {state.error}
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Payment Approval Dialog */}
      {selectedFile && (
        <PaymentApprovalDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          file={selectedFile}
          onApprove={handlePaymentApproved}
          onCancel={handlePaymentCancelled}
          epochs={epochs}
        />
      )}
    </Card>
  );
}
