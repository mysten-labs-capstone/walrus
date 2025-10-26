import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useSingleFileUpload } from "../hooks/useSingleFileUpload";

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
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-lg relative">
      {/* Toast */}
      {showToast && (
        <div className="absolute top-2 right-2 bg-green-600 text-white px-3 py-1 rounded shadow text-sm animate-fade-out">
          Upload complete
        </div>
      )}

      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Upload</h2>
          <p className="text-sm text-gray-500">
            Select a file to upload it to Walrus.
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
            onChange={onFiles}
            disabled={disabled}
          />
        </div>
      </header>

      {/* Status UI */}
      {state.file && (
        <article className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-gray-800">
              {state.file.name}
            </p>
            <p className="text-xs text-gray-500">
              {formatBytes(state.file.size)} • {state.status}
            </p>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded bg-gray-100">
            <div
              className="h-full transition-all bg-indigo-600"
              style={{ width: `${state.progress}%` }}
            />
          </div>

          {/* Error */}
          {state.status === "error" && state.error && (
            <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
              {state.error}
            </div>
          )}

          {/* Cancel Button */}
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
    </section>
  );
}
