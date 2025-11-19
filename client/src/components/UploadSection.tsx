import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Trash2, Upload, Lock, LockOpen, FileUp, Clock } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useSingleFileUpload } from "../hooks/useSingleFileUpload";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

type UploadSectionProps = {
  onUploaded?: (file: { blobId: string; file: File; encrypted: boolean }) => void;
};

export default function UploadSection({ onUploaded }: UploadSectionProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { privateKey } = useAuth();
  const { enqueue } = useUploadQueue();
  const { state, startUpload, reset } = useSingleFileUpload(onUploaded);
  const [encrypt, setEncrypt] = useState(true);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);

  const canEncrypt = useMemo(() => !!privateKey, [privateKey]);
  const selectedFile = selectedFiles.length === 1 ? selectedFiles[0] : null;

  useEffect(() => {
    if (state.status === "done") {
      setShowToast("✅ Upload complete");
      const timer = setTimeout(() => {
        setShowToast(null);
        reset();
        setSelectedFiles([]);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [state.status, reset]);

  const pickFile = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    // If multiple files, automatically queue them
    if (fileArray.length > 1) {
      for (const file of fileArray) {
        await enqueue(file, encrypt);
      }
      setShowToast(`⏰ ${fileArray.length} files queued`);
      setTimeout(() => setShowToast(null), 2500);
      // Clear the input
      if (e.target) e.target.value = '';
    } else {
      // Single file - show upload options
      setSelectedFiles(fileArray);
    }
  }, [enqueue, encrypt]);

  const handleUploadNow = useCallback(() => {
    if (!selectedFile) return;
    
    // Always show payment approval dialog
    setPendingUploadFile(selectedFile);
    setShowPaymentDialog(true);
  }, [selectedFile]);

  const handlePaymentApproved = useCallback((costUSD: number) => {
    if (!pendingUploadFile) return;
    // Use privateKey if available (for Session Signer), otherwise empty string (backend will use master key)
    startUpload(pendingUploadFile, privateKey || "", encrypt, costUSD);
    setShowPaymentDialog(false);
    setPendingUploadFile(null);
  }, [pendingUploadFile, privateKey, encrypt, startUpload]);

  const handlePaymentCancelled = useCallback(() => {
    setShowPaymentDialog(false);
    setPendingUploadFile(null);
  }, []);

  const handleUploadLater = useCallback(async () => {
    if (selectedFile) {
      await enqueue(selectedFile, encrypt);
      setShowToast(encrypt ? "⏰ Queued (will be encrypted)" : "⏰ Queued (no encryption)");
      setSelectedFiles([]);
      setTimeout(() => setShowToast(null), 2500);
    }
  }, [enqueue, selectedFile, encrypt]);

  return (
    <Card className="relative overflow-hidden border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileUp className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              Upload Files
            </CardTitle>
            <CardDescription className="mt-1">
              Securely store your files on the Walrus decentralized network
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Encryption Toggle */}
        <div className="rounded-lg border-2 border-dashed border-blue-300/50 bg-blue-50/50 p-4 dark:border-blue-700/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {encrypt ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 shadow-md">
                  <Lock className="h-5 w-5 text-white" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md">
                  <LockOpen className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">
                  {encrypt ? 'Encryption Enabled' : 'Encryption Disabled'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {encrypt ? 'Files will be encrypted before upload' : 'Files will be uploaded without encryption'}
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
          className="group relative cursor-pointer overflow-hidden rounded-xl border-2 border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-cyan-50 p-12 text-center transition-all hover:border-blue-400 hover:bg-gradient-to-br hover:from-blue-100 hover:to-cyan-100 dark:border-blue-700 dark:from-slate-800 dark:to-slate-700 dark:hover:border-blue-600"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg transition-transform group-hover:scale-110">
              <Upload className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Click to select file(s)
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Select multiple files to queue them automatically
              </p>
            </div>
          </div>
        </div>

        {/* Selected File UI */}
        {selectedFile && state.status === "idle" && (
          <div className="animate-slide-up space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {selectedFile.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatBytes(selectedFile.size)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedFiles([])}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            {/* Upload buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={(e) => {
                  console.log("[UploadSection] Upload Now button clicked!", e);
                  handleUploadNow();
                }}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Now
              </Button>
              <Button
                type="button"
                onClick={handleUploadLater}
                variant="outline"
                className="flex-1 border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                <Clock className="mr-2 h-4 w-4" />
                Upload Later
              </Button>
            </div>
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
          <div className="animate-slide-up space-y-3 rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
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
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-300"
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
      {pendingUploadFile && (
        <PaymentApprovalDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          file={pendingUploadFile}
          onApprove={handlePaymentApproved}
          onCancel={handlePaymentCancelled}
        />
      )}
    </Card>
  );
}
