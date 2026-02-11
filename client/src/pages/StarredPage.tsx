import { useState, useEffect } from "react";
import {
  Star,
  Lock,
  LockOpen,
  HardDrive,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import {
  StatusBadgeTooltip,
  STATUS_BADGE_TOOLTIPS,
} from "../components/StatusBadgeTooltip";

interface StarredFile {
  blobId: string;
  filename: string;
  originalSize: number;
  encrypted: boolean;
  uploadedAt: string;
  starred?: boolean;
  status?: "pending" | "processing" | "completed" | "failed";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function truncateFileName(name: string, maxLength: number = 70): string {
  if (name.length <= maxLength) return name;
  return `${name.slice(0, Math.max(0, maxLength - 3))}...`;
}

function calculateExpiryInfo(uploadedAt: string, epochs: number = 3) {
  const uploadDate = new Date(uploadedAt);
  const daysPerEpoch = 14;
  const totalDays = epochs * daysPerEpoch;
  const expiryDate = new Date(
    uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000,
  );
  const now = new Date();
  const daysRemaining = Math.ceil(
    (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );

  return {
    expiryDate,
    daysRemaining: Math.max(0, daysRemaining),
    totalDays,
    isExpired: daysRemaining <= 0,
  };
}

export default function StarredPage() {
  const [starredFiles, setStarredFiles] = useState<StarredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const user = authService.getCurrentUser();

  const loadStarredFiles = async () => {
    if (!user?.id) {
      setStarredFiles([]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(
        apiUrl(`/api/cache?userId=${user.id}&starred=true`),
      );
      if (res.ok) {
        const data = await res.json();
        const filesFromCache: StarredFile[] = data.files.map((f: any) => ({
          blobId: f.blobId,
          filename: f.filename,
          originalSize: f.originalSize,
          encrypted: f.encrypted,
          uploadedAt: f.uploadedAt,
          starred: true,
          status: f.status,
        }));

        const filesWithStatus = await Promise.all(
          filesFromCache.map(async (file) => {
            if (file.status) return file;
            try {
              const statusRes = await fetch(
                apiUrl(`/api/files/${file.blobId}?userId=${user.id}`),
              );
              if (!statusRes.ok) return file;
              const statusData = await statusRes.json();
              return {
                ...file,
                status: statusData.status ?? file.status,
              };
            } catch {
              return file;
            }
          }),
        );

        setStarredFiles(filesWithStatus);
      }
    } catch (err) {
      console.error("Failed to load starred files:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStarredFiles();
  }, [user?.id]);

  const handleUnstar = async (blobId: string) => {
    if (!user?.id) return;

    const previous = starredFiles;
    setStarredFiles((files) => files.filter((f) => f.blobId !== blobId));

    try {
      const res = await fetch(apiUrl(`/api/cache/${blobId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, starred: false }),
      });

      if (!res.ok) {
        setStarredFiles(previous);
      }
    } catch (err) {
      console.error("Failed to unstar file:", err);
      setStarredFiles(previous);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <h1 className="text-2xl font-semibold text-white">Favorite Files</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"></div>
      ) : starredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
            <Star className="h-12 w-12 text-emerald-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            No favorite files yet
          </h3>
          <p className="text-gray-300 max-w-md">
            Star your favorite files to find them here quickly
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {starredFiles.map((file) => {
            const expiry = calculateExpiryInfo(file.uploadedAt);
            const displayStatus = file.status;

            return (
              <div
                key={file.blobId}
                className="group relative rounded-xl border p-4 shadow-sm transition-all hover:shadow-md w-full border-emerald-800/50 bg-emerald-950/30 hover:border-emerald-700"
              >
                <div className="flex items-start gap-3 w-full">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
                    {file.encrypted ? (
                      <Lock className="h-5 w-5 text-green-400" />
                    ) : (
                      <LockOpen className="h-5 w-5 text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-gray-100 truncate">
                        {truncateFileName(file.filename)}
                      </p>
                      {displayStatus && (
                        <span className="inline-flex items-center gap-1 ml-2">
                          {displayStatus === "completed" &&
                            !file.blobId.startsWith("temp_") && (
                              <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.walrus}>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-300">
                                  <HardDrive className="h-3 w-3" />
                                  Walrus
                                </span>
                              </StatusBadgeTooltip>
                            )}

                          {(displayStatus === "processing" ||
                            displayStatus === "pending" ||
                            (displayStatus === "completed" &&
                              file.blobId.startsWith("temp_"))) && (
                            <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.processing}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Processing
                              </span>
                            </StatusBadgeTooltip>
                          )}

                          {displayStatus === "failed" && (
                            <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.failed}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                <AlertCircle className="h-3 w-3" />
                                Failed
                              </span>
                            </StatusBadgeTooltip>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                      <span>{formatBytes(file.originalSize)}</span>
                      <span>•</span>
                      <span>{formatDate(file.uploadedAt)}</span>
                      <span>•</span>
                      <span
                        className={
                          expiry.isExpired
                            ? "text-red-500"
                            : expiry.daysRemaining < 30
                              ? "text-orange-500"
                              : ""
                        }
                      >
                        {expiry.isExpired
                          ? "Expired"
                          : `${expiry.daysRemaining}d left`}
                      </span>
                    </div>
                  </div>

                  <div className="ml-2 flex items-center gap-1 self-center">
                    <div className="flex items-center gap-1 transition-opacity opacity-0 group-hover:opacity-100">
                      <button
                        title="Unstar"
                        onClick={() => handleUnstar(file.blobId)}
                        className="p-2 rounded-lg transition-colors hover:bg-zinc-800 dark:hover:bg-zinc-700"
                      >
                        <Star className="h-5 w-5 text-emerald-300 fill-emerald-300" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
