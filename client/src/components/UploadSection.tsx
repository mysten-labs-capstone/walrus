import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Trash2, Upload, Lock, LockOpen, FileUp } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useSingleFileUpload } from "../hooks/useSingleFileUpload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";

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

  const { state, startUpload, reset } = useSingleFileUpload(onUploaded);
  const [encrypt, setEncrypt] = useState(true);
  const [showToast, setShowToast] = useState(false);

  const disabled = useMemo(() => !privateKey, [privateKey]);

  useEffect(() => {
    if (state.status === "done") {
      setShowToast(true);
      const timer = setTimeout(() => {
        setShowToast(false);
        reset();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.status, reset]);

  const pickFile = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const onFiles = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];

      // if an upload is active, confirm replacement
      if (state.status !== "idle" && state.status !== "done") {
        const replace = confirm(
          "A file is currently uploading. Replace it with the new file?"
        );
        if (!replace) {
          e.currentTarget.value = "";
          return;
        }
      }

      startUpload(file, privateKey!, encrypt);
      e.currentTarget.value = "";
    },
    [state.status, startUpload, privateKey, encrypt]
  );

  return (
    <Card className="relative overflow-hidden border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
      {/* Toast */}
      {showToast && (
        <div className="absolute top-4 right-4 z-10 animate-slide-up rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-lg">
          ✓ Upload complete
        </div>
      )}

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
            className="hidden"
            onChange={onFiles}
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg transition-transform group-hover:scale-110">
              <Upload className="h-8 w-8 text-white" />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                Click to select a file
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                or drag and drop your file here
              </p>
            </div>
          </div>
        </div>

        {/* Status UI */}
        {state.file && (
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
              {state.status !== "idle" && state.status !== "done" && (
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
    </Card>
  );
}
