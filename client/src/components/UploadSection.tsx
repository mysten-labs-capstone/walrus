import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Upload, Lock, LockOpen, X, AlertCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Switch } from "./ui/switch";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";
import {
  BatchPaymentApprovalDialog,
  BatchPaymentQuote,
} from "./BatchPaymentApprovalDialog";
import { apiUrl } from "../config/api";
import {
  FILE_PICKER_ACCEPT,
  filterAllowedFiles,
  getDisallowedExtensions,
} from "../config/allowedFileTypes";
import { authService } from "../services/authService";

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
  currentFolderId?: string | null;
};

export default function UploadSection({
  onUploaded,
  epochs,
  onEpochsChange,
  onFileQueued,
  onSingleFileUploadStarted,
  currentFolderId = null,
}: UploadSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { privateKey, requestReauth } = useAuth();
  const { enqueue, processQueue } = useUploadQueue();
  const user = authService.getCurrentUser();
  // Read encryption preference from localStorage
  const [encrypt, setEncrypt] = useState(() => {
    try {
      const saved = localStorage.getItem("walrus_encryption_enabled");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);
  const [fileTypeError, setFileTypeError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pendingQueueFiles, setPendingQueueFiles] = useState<File[]>([]);
  const [shouldOpenFilePicker, setShouldOpenFilePicker] = useState(false);
  // Store the target folder ID for the current upload operation
  // This can differ from currentFolderId when files are dragged to a specific folder
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

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

  const isBatchSelection = selectedFiles.length > 1;

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB; allow +100KB so "100.0 MB" passes
  const MAX_FILE_SIZE_LIMIT = MAX_FILE_SIZE + 100 * 1024;
  const FILE_TOO_LARGE_MSG =
    "File is too large. Maximum size is 100 MB. Please choose a smaller file.";

  // Auto-dismiss error toasts after 5 seconds
  useEffect(() => {
    if (!fileSizeError && !fileTypeError && !paymentError) return;
    const t = setTimeout(() => {
      setFileSizeError(null);
      setFileTypeError(null);
      setPaymentError(null);
    }, 5000);
    return () => clearTimeout(t);
  }, [fileSizeError, fileTypeError, paymentError]);

  // Resume pending files after reauth succeeds
  useEffect(() => {
    if (pendingQueueFiles.length > 0 && privateKey) {
      setSelectedFiles(pendingQueueFiles);
      setPendingQueueFiles([]);
      setShowPaymentDialog(true);
    }
  }, [pendingQueueFiles, privateKey]);

  // Open file picker after reauth succeeds
  useEffect(() => {
    if (shouldOpenFilePicker && privateKey) {
      setShouldOpenFilePicker(false);
      inputRef.current?.click();
    }
  }, [shouldOpenFilePicker, privateKey]);

  const pickFile = useCallback(() => {
    // If encryption is enabled but key is missing, request reauth first
    if (encrypt && !privateKey) {
      setShouldOpenFilePicker(true);
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

  // Listen for "upload-files-dropped" events (triggered when files are drag-dropped onto the page)
  useEffect(() => {
    const handler = async (e: Event) => {
      const customEvent = e as CustomEvent<{
        files: File[];
        folderId?: string | null;
      }>;
      const files = customEvent.detail?.files || [];
      const folderId = customEvent.detail?.folderId;

      if (files.length === 0) {
        console.warn("No files in upload-files-dropped event");
        return;
      }

      // For folder drops: keep only allowed file types (batch upload allowed types only)
      const allowedFiles = filterAllowedFiles(files);
      if (allowedFiles.length === 0) {
        setFileTypeError(
          "No allowed file types in the dropped files. Only documents, images, videos, audio, archives, and office files can be uploaded.",
        );
        return;
      }

      // Check file size limit
      const oversizedFiles = allowedFiles.filter((f) => f.size > MAX_FILE_SIZE_LIMIT);
      if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map((f) => f.name).join(", ");
        setFileSizeError(
          fileNames
            ? `${FILE_TOO_LARGE_MSG} (${fileNames})`
            : FILE_TOO_LARGE_MSG,
        );
        return;
      }

      // Clear any previous error
      setFileSizeError(null);
      setFileTypeError(null);
      setPaymentError(null);

      // Check encryption requirements
      if (encrypt && !privateKey) {
        setPendingQueueFiles(allowedFiles);
        setTargetFolderId(folderId || currentFolderId);
        requestReauth();
        return;
      }

      // Store the target folder for this upload operation
      setTargetFolderId(folderId || currentFolderId);
      // Open payment dialog
      setSelectedFiles(allowedFiles);
      setShowPaymentDialog(true);
    };
    window.addEventListener("upload-files-dropped", handler as EventListener);
    return () =>
      window.removeEventListener(
        "upload-files-dropped",
        handler as EventListener,
      );
  }, [encrypt, privateKey, requestReauth, currentFolderId]);

  const onFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const fileArray = Array.from(files);

      // Check file type (only allowed extensions)
      const disallowed = getDisallowedExtensions(fileArray);
      if (disallowed.length > 0) {
        setFileTypeError(
          `These file types are not allowed: ${disallowed.join(", ")}. Only documents, images, videos, audio, archives, and office files can be uploaded.`,
        );
        if (e.target) e.target.value = "";
        return;
      }

      // Check file size limit (100MB max to prevent server OOM)
      const oversizedFiles = fileArray.filter((f) => f.size > MAX_FILE_SIZE_LIMIT);
      if (oversizedFiles.length > 0) {
        const fileNames = oversizedFiles.map((f) => f.name).join(", ");
        setFileSizeError(
          fileNames
            ? `${FILE_TOO_LARGE_MSG} (${fileNames})`
            : FILE_TOO_LARGE_MSG,
        );
        if (e.target) e.target.value = "";
        return;
      }

      // Clear any previous error
      setFileSizeError(null);
      setFileTypeError(null);
      setPaymentError(null);

      // Check encryption requirements
      if (encrypt && !privateKey) {
        setPendingQueueFiles(fileArray);
        setTargetFolderId(currentFolderId);
        requestReauth();
        if (e.target) e.target.value = "";
        return;
      }

      // Store the target folder for this upload operation
      setTargetFolderId(currentFolderId);
      // If multiple files, open payment dialog and start uploads after approval
      if (fileArray.length > 1) {
        setSelectedFiles(fileArray);
        setShowPaymentDialog(true);
        if (e.target) e.target.value = "";
      } else {
        // Single file - open the payment flow immediately
        setSelectedFiles(fileArray);
        setShowPaymentDialog(true);
      }
    },
    [encrypt, privateKey, requestReauth, currentFolderId],
  );

  const handlePaymentApproved = useCallback(
    async (costUSD: number, selectedEpochs: number) => {
      if (selectedFiles.length === 0) return;

      setPaymentError(null);
      const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
      for (const file of selectedFiles) {
        const share = totalSize > 0 ? file.size / totalSize : 0;
        const perFileCost = costUSD * share;
        await enqueue(
          file,
          encrypt,
          perFileCost,
          selectedEpochs,
          targetFolderId,
        );
      }
      setSelectedFiles([]);
      setTargetFolderId(null); // Clear after upload
      onEpochsChange(selectedEpochs);
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
      onEpochsChange,
      targetFolderId,
    ],
  );

  const buildTempId = useCallback(
    (file: File, index: number) => `${index}-${file.name}-${file.size}`,
    [],
  );

  const handleBatchPaymentApproved = useCallback(
    async (quote: BatchPaymentQuote, selectedEpochs: number) => {
      if (selectedFiles.length === 0) return;

      if (!user) {
        setPaymentError("User not authenticated");
        return;
      }

      setPaymentError(null);

      try {
        const tempIds = selectedFiles.map((file, index) =>
          buildTempId(file, index),
        );

        const enqueueResponse = await fetch(
          apiUrl("/api/upload/enqueue-batch"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: user.id,
              quoteId: quote.quoteId,
              tempIds,
            }),
          },
        );

        if (!enqueueResponse.ok) {
          const errorData = await enqueueResponse.json().catch(() => ({}));
          throw new Error(errorData.error || "Batch quote validation failed");
        }

        const perFileCost = new Map(
          quote.perFile.map((entry) => [entry.tempId, entry.costUSD]),
        );

        for (const [index, file] of selectedFiles.entries()) {
          const tempId = buildTempId(file, index);
          const costUSD = perFileCost.get(tempId);
          if (costUSD === undefined) {
            throw new Error("Missing cost for a selected file");
          }
          await enqueue(file, encrypt, costUSD, selectedEpochs, targetFolderId);
        }

        setSelectedFiles([]);
        setTargetFolderId(null); // Clear after upload
        onEpochsChange(selectedEpochs);
        processQueue();
        onFileQueued?.();
        onSingleFileUploadStarted?.();
      } catch (err) {
        console.error("Failed to calculate batch costs:", err);
        setPaymentError(
          "Failed to calculate cost for all files. Please try again.",
        );
      }
    },
    [
      selectedFiles,
      encrypt,
      enqueue,
      processQueue,
      onFileQueued,
      onSingleFileUploadStarted,
      onEpochsChange,
      targetFolderId,
      user,
      buildTempId,
    ],
  );

  const handlePaymentCancelled = useCallback(() => {
    // User cancelled payment - clear selection so they can pick another file
    setShowPaymentDialog(false);
    setSelectedFiles([]);
    setTargetFolderId(null); // Clear target folder
    setPaymentError(null);
    // Also reset the file input value so the same file can be selected again
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  // Sync encryption preference to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("walrus_encryption_enabled", JSON.stringify(encrypt));
  }, [encrypt]);

  // Listen for upload completion and notify parent component
  useEffect(() => {
    const handleUploadFinished = (e: CustomEvent) => {
      const uploadedFile = e.detail;
      if (onUploaded && uploadedFile) {
        // Create a minimal File object for the callback
        // The callback expects { blobId, file, encrypted, epochs }
        const fileData = {
          blobId: uploadedFile.blobId,
          file: new File([], uploadedFile.name, { type: uploadedFile.type }),
          encrypted: uploadedFile.encrypted,
          epochs: uploadedFile.epochs,
        };
        onUploaded(fileData);
      }
    };

    window.addEventListener(
      "lazy-upload-finished",
      handleUploadFinished as EventListener,
    );
    return () =>
      window.removeEventListener(
        "lazy-upload-finished",
        handleUploadFinished as EventListener,
      );
  }, [onUploaded]);

  return (
    <>
      {/* Hidden file input - component used headlessly */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept={FILE_PICKER_ACCEPT}
        onChange={onFileChange}
      />
      {/* Error toasts - same style and location as decentralizing notification */}
      {fileSizeError && !showPaymentDialog && (
        <div
          className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-100">
                File too large
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">
                {fileSizeError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFileSizeError(null)}
              className="p-1 rounded hover:bg-emerald-900/40 text-emerald-300 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {fileTypeError && !showPaymentDialog && (
        <div
          className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-100">
                File type not allowed
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">
                {fileTypeError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFileTypeError(null)}
              className="p-1 rounded hover:bg-emerald-900/40 text-emerald-300 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {paymentError && !showPaymentDialog && (
        <div
          className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-100">
                Upload error
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">
                {paymentError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPaymentError(null)}
              className="p-1 rounded hover:bg-emerald-900/40 text-emerald-300 flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Active Upload Status UI hidden */}

      {/* Payment Approval Dialog */}
      {paymentFile && !isBatchSelection && (
        <PaymentApprovalDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          file={paymentFile}
          onApprove={handlePaymentApproved}
          onCancel={handlePaymentCancelled}
          epochs={epochs}
          onEpochsChange={onEpochsChange}
        />
      )}
      {isBatchSelection && selectedFiles.length > 0 && (
        <BatchPaymentApprovalDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          files={selectedFiles.map((file, index) => ({
            id: buildTempId(file, index),
            filename: file.name,
            size: file.size,
            epochs,
            contentType: file.type,
          }))}
          onApprove={handleBatchPaymentApproved}
          onCancel={handlePaymentCancelled}
          currentEpochs={epochs}
        />
      )}
    </>
  );
}
