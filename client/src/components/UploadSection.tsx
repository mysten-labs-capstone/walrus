import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2, Clock, Upload } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useSingleFileUpload } from "../hooks/useSingleFileUpload";
import { useUploadQueue } from "../hooks/useUploadQueue";

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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const disabled = useMemo(() => !privateKey, [privateKey]);

  useEffect(() => {
    if (state.status === "done") {
      setShowToast("✅ Upload complete");
      const timer = setTimeout(() => {
        setShowToast(null);
        reset();
        setSelectedFile(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.status, reset]);

  const pickFile = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) setSelectedFile(files[0]);
  }, []);

  const handleUploadNow = useCallback(() => {
    if (selectedFile && privateKey) {
      startUpload(selectedFile, privateKey, encrypt);
    }
  }, [selectedFile, privateKey, encrypt, startUpload]);

  const handleUploadLater = useCallback(async () => {
    if (selectedFile) {
      await enqueue(selectedFile, encrypt);
      setShowToast(encrypt ? "Queued (will be encrypted)" : "Queued (no encryption)");
      setSelectedFile(null);
      setTimeout(() => setShowToast(null), 2500);
    }
  }, [enqueue, selectedFile, encrypt]);

  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-lg relative">
      {showToast && (
        <div className="absolute top-2 right-2 bg-indigo-600 text-white px-3 py-1 rounded shadow text-sm">
          {showToast}
        </div>
      )}

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Upload</h2>
          <p className="text-sm text-gray-500">
            Choose a file to upload now or queue for later.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={encrypt}
              onChange={(e) => setEncrypt(e.target.checked)}
              disabled={state.status !== "idle"}
            />
            Encrypt
          </label>

          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={onFileChange}
            disabled={disabled}
          />
        </div>
      </header>

      {selectedFile && (
        <article className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gray-800">
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatBytes(selectedFile.size)}
            </p>
          </div>

          <div className="mt-3 flex gap-3">
            <button
              onClick={handleUploadNow}
              disabled={state.status !== "idle"}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition"
            >
              <Upload className="h-4 w-4" /> Upload Now
            </button>

            <button
              onClick={handleUploadLater}
              className="flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition"
            >
              <Clock className="h-4 w-4" /> Upload Later
            </button>
          </div>
          {/* Show validation/upload error inline next to the selected file as well
              so early validation failures are visible even before the upload
              flow replaces the selection state. */}
          {state.status === "error" && state.error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {state.error}
            </div>
          )}
        </article>
      )}

      {state.file && (
        <article className="rounded-xl border border-gray-200 p-4 mt-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gray-800">
              {state.file.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatBytes(state.file.size)} • {state.status}
            </p>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-full transition-all bg-indigo-600"
              style={{ width: `${state.progress}%` }}
            />
          </div>

          {state.status === "error" && state.error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {state.error}
            </div>
          )}

          {state.status !== "idle" && state.status !== "done" && (
            <button
              type="button"
              onClick={reset}
              className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              <Trash2 className="h-3 w-3" /> Cancel upload
            </button>
          )}
        </article>
      )}

      {/* If an error occurred but we don't have a state.file (for example
          validation failed early), still show the error so the user can see
          why the upload failed. This makes tests and UX more robust. */}
      {state.status === "error" && state.error && !state.file && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {state.error}
        </div>
      )}
    </section>
  );
}
