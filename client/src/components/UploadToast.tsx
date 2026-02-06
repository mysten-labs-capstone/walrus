import { useEffect, useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Loader2, CheckCircle2 } from "lucide-react";
import { useUploadQueue } from "../hooks/useUploadQueue";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function RetryCountdown({
  retryAfter,
  retryCount,
  maxRetries,
}: {
  retryAfter?: number;
  retryCount?: number;
  maxRetries?: number;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!retryAfter) {
      setSecondsLeft(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((retryAfter - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [retryAfter]);

  if (secondsLeft === null) return null;

  return (
    <span className="text-amber-600 dark:text-amber-400 text-sm">
      Retrying in {secondsLeft}s (attempt {retryCount || 0}/{maxRetries || 3})
    </span>
  );
}

export default function UploadToast() {
  const { items, refresh } = useUploadQueue();
  const [collapsed, setCollapsed] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [doneFile, setDoneFile] = useState<string | null>(null);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("upload-queue-updated", handler);

    const interval = setInterval(() => {
      refresh();
    }, 3000);

    return () => {
      window.removeEventListener("upload-queue-updated", handler);
      clearInterval(interval);
    };
  }, [refresh]);

  // Listen for single file done event
  useEffect(() => {
    const handleSingleFileDone = (e: any) => {
      setShowDone(true);
      setDoneFile(e.detail?.filename || "File");
      setTimeout(() => {
        setShowDone(false);
        setDoneFile(null);
      }, 3000);
    };

    window.addEventListener("single-file-upload-done", handleSingleFileDone);
    return () =>
      window.removeEventListener(
        "single-file-upload-done",
        handleSingleFileDone,
      );
  }, []);

  // Filter active uploads (not done)
  const activeItems = useMemo(() => {
    return items.filter(
      (item) =>
        item.status === "queued" ||
        item.status === "uploading" ||
        item.status === "retrying",
    );
  }, [items]);

  // Don't show toast if no active items and not showing done message
  if (activeItems.length === 0 && !showDone) {
    return null;
  }

  return (
    <>
      {/* Done Message - shows for 3 seconds on single file upload */}
      {showDone && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-green-600/95 backdrop-blur-md border border-green-400/30 rounded-lg p-4 flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="h-5 w-5 text-green-100 flex-shrink-0" />
            <span className="text-green-50 font-medium">
              ✅ {doneFile} uploaded successfully
            </span>
          </div>
        </div>
      )}

      {/* Upload Queue Toast */}
      {activeItems.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300 w-80 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg">
          {/* Collapse Button */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 text-teal-400 animate-spin flex-shrink-0" />
              <span className="text-zinc-200 font-medium">
                Uploading {activeItems.length} file
                {activeItems.length > 1 ? "s" : ""}
              </span>
            </div>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-400 hover:text-zinc-100"
              title={collapsed ? "Expand" : "Collapse"}
            >
              {collapsed ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Items List - shown when not collapsed */}
          {!collapsed && (
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3 border-t border-zinc-700 first:border-t-0 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate font-medium">
                        {item.filename}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {formatBytes(item.size)}
                      </p>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2">
                    {item.status === "uploading" && (
                      <>
                        <div className="flex-1 bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-600 h-full transition-all duration-300"
                            style={{ width: `${item.progress || 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-400">
                          {Math.round(item.progress || 0) >= 100
                            ? "Done"
                            : `${Math.round(item.progress || 0)}%`}
                        </span>
                      </>
                    )}
                    {item.status === "queued" && (
                      <span className="text-xs text-zinc-400">Queued...</span>
                    )}
                    {item.status === "retrying" && (
                      <RetryCountdown
                        retryAfter={item.retryAfter}
                        retryCount={item.retryCount}
                        maxRetries={item.maxRetries}
                      />
                    )}
                  </div>

                  {/* Error message */}
                  {item.error && (
                    <div className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">
                      {item.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
