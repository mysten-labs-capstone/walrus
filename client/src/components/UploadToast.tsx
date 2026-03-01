import { useEffect, useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Folder,
} from "lucide-react";
import { useUploadQueue, type QueuedUpload } from "../hooks/useUploadQueue";

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

function FileItemRow({ item }: { item: QueuedUpload; indent?: boolean }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-200 truncate font-medium">
            {item.filename}
          </p>
          <p className="text-xs text-zinc-400">{formatBytes(item.size)}</p>
        </div>
      </div>

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

      {item.error && (
        <div className="text-xs text-red-400 bg-red-950/30 rounded px-2 py-1">
          {item.error}
        </div>
      )}
    </div>
  );
}

type GroupedEntry =
  | { type: "file"; item: QueuedUpload }
  | { type: "folder"; name: string; items: QueuedUpload[] };

export default function UploadToast() {
  const { items, refresh } = useUploadQueue();
  const [collapsed, setCollapsed] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [doneFile, setDoneFile] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("upload-queue-updated", handler);

    const interval = setInterval(() => {
      refresh();
    }, 1000);

    return () => {
      window.removeEventListener("upload-queue-updated", handler);
      clearInterval(interval);
    };
  }, [refresh]);

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

  const activeItems = useMemo(() => {
    return items.filter(
      (item) =>
        item.status === "queued" ||
        item.status === "uploading" ||
        item.status === "retrying",
    );
  }, [items]);

  const grouped = useMemo((): GroupedEntry[] => {
    const folderMap = new Map<string, QueuedUpload[]>();
    const standalone: QueuedUpload[] = [];

    for (const item of activeItems) {
      if (item.folderUploadName) {
        const list = folderMap.get(item.folderUploadName) ?? [];
        list.push(item);
        folderMap.set(item.folderUploadName, list);
      } else {
        standalone.push(item);
      }
    }

    const entries: GroupedEntry[] = [];
    for (const [name, folderItems] of folderMap) {
      entries.push({ type: "folder", name, items: folderItems });
    }
    for (const item of standalone) {
      entries.push({ type: "file", item });
    }
    return entries;
  }, [activeItems]);

  const toggleFolder = (name: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  if (activeItems.length === 0 && !showDone) {
    return null;
  }

  return (
    <>
      {showDone && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-green-600/95 backdrop-blur-md border border-green-400/30 rounded-lg p-4 flex items-center gap-3 shadow-lg">
            <CheckCircle2 className="h-5 w-5 text-green-100 flex-shrink-0" />
            <span className="text-green-50 font-medium">
              {doneFile} uploaded successfully
            </span>
          </div>
        </div>
      )}

      {activeItems.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300 w-80 bg-zinc-900 border border-zinc-800 rounded-lg shadow-lg">
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

          {!collapsed && (
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
              {grouped.map((entry) => {
                if (entry.type === "file") {
                  return (
                    <div
                      key={entry.item.id}
                      className="p-3 border-t border-zinc-700 first:border-t-0"
                    >
                      <FileItemRow item={entry.item} />
                    </div>
                  );
                }

                const { name, items: folderItems } = entry;
                const isExpanded = expandedFolders.has(name);
                const doneCount = folderItems.filter(
                  (f) =>
                    f.status === "uploading" &&
                    Math.round(f.progress || 0) >= 100,
                ).length;
                const totalSize = folderItems.reduce(
                  (s, f) => s + f.size,
                  0,
                );

                return (
                  <div
                    key={`folder-${name}`}
                    className="border-t border-zinc-700 first:border-t-0"
                  >
                    <button
                      onClick={() => toggleFolder(name)}
                      className="w-full flex items-center gap-2 p-3 hover:bg-zinc-800/50 transition-colors text-left"
                    >
                      <ChevronRight
                        className={`h-3.5 w-3.5 text-zinc-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      />
                      <Folder className="h-4 w-4 text-teal-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 truncate font-medium">
                          {name}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {folderItems.length} file
                          {folderItems.length > 1 ? "s" : ""} &middot;{" "}
                          {formatBytes(totalSize)}
                          {doneCount > 0 &&
                            ` · ${doneCount}/${folderItems.length} done`}
                        </p>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="pl-6 pr-3 pb-2 space-y-2">
                        {folderItems.map((item) => (
                          <div
                            key={item.id}
                            className="border-l border-zinc-700 pl-3 py-1"
                          >
                            <FileItemRow item={item} indent />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
