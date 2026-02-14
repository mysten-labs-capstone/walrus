import {
  LockOpen,
  Lock,
  FileText,
  Calendar,
  HardDrive,
  Loader2,
  Clock,
  Copy,
  Check,
  Trash2,
  Download,
  CalendarPlus,
  AlertCircle,
  Share2,
  MoreVertical,
  FolderInput,
  Info,
  Folder,
} from "lucide-react";
import { useDaysPerEpoch } from "../hooks/useDaysPerEpoch";
import { useCallback, useState, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { downloadBlob, deleteBlob } from "../services/walrusApi";
import { authService } from "../services/authService";
import { decryptWalrusBlob } from "../services/decryptWalrusBlob";
import { removeCachedFile } from "../lib/fileCache";
import {
  StatusBadgeTooltip,
  STATUS_BADGE_TOOLTIPS,
} from "./StatusBadgeTooltip";

export type UploadedFile = {
  blobId: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  uploadedAt: string;
  epochs?: number; // Storage duration in epochs
  status?: "pending" | "processing" | "completed" | "failed";
  s3Key?: string | null;
  folderId?: string | null;
  folderPath?: string | null; // e.g., "Documents/Projects"
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RecentUploads({
  items,
  onFileDeleted,
}: {
  items: UploadedFile[];
  onFileDeleted?: () => void;
}) {
  const daysPerEpoch = useDaysPerEpoch();
  const { privateKey, requestReauth } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{
    blobId: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);

  // Use ref to store pending download params to avoid stale closure
  const pendingDownloadRef = useRef<{
    blobId: string;
    name?: string;
    encrypted?: boolean;
  } | null>(null);

  // Track if we're waiting for reauth to prevent duplicate requests
  const waitingForReauthRef = useRef(false);

  // Store latest downloadFile ref to avoid stale closure in callbacks
  const downloadFileRef =
    useRef<
      (blobId: string, name?: string, encrypted?: boolean) => Promise<void>
    >();

  // Share dialog state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFile, setShareFile] = useState<{
    blobId: string;
    filename: string;
    encrypted: boolean;
    uploadedAt?: string;
    epochs?: number;
  } | null>(null);

  // Move file dialog state
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [fileToMove, setFileToMove] = useState<{
    blobId: string;
    name: string;
    currentFolderId?: string | null;
  } | null>(null);

  // Dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleShare = useCallback(
    async (blobId: string, filename: string, skipReauthCheck = false) => {
      // Check for session key - trigger reauth if missing
      if (!skipReauthCheck && (!privateKey || privateKey.trim() === "")) {
        requestReauth(() => {
          // Retry share after reauth, skip check this time
          handleShare(blobId, filename, true);
        });
        return;
      }

      try {
        const user = authService.getCurrentUser();
        if (!user?.id) {
          alert("You must be logged in to share files");
          return;
        }

        // Fetch file metadata
        const response = await fetch(
          apiUrl(`/api/files/${blobId}?userId=${user.id}`),
        );
        if (!response.ok) {
          throw new Error("Failed to fetch file metadata");
        }

        const fileData = await response.json();

        // Check if file is fully uploaded to Walrus
        if (
          fileData.status &&
          (fileData.status === "processing" || fileData.status === "pending")
        ) {
          setShareError(
            "This file is still being uploaded to Walrus. Please wait until the upload is complete before sharing.",
          );
          setTimeout(() => setShareError(null), 5000);
          return;
        }

        if (fileData.status === "failed") {
          setShareError(
            "This file has failed to upload to Walrus. Please wait for server to retry before sharing.",
          );
          setTimeout(() => setShareError(null), 5000);
          return;
        }

        setShareFile({
          blobId,
          filename,
          encrypted: fileData.encrypted,
          uploadedAt: fileData.uploadedAt,
          epochs: fileData.epochs,
        });
        setShareDialogOpen(true);
      } catch (err: any) {
        console.error("[handleShare] Error:", err);
        setShareError(err.message || "Failed to prepare file for sharing");
        setTimeout(() => setShareError(null), 5000);
      }
    },
    [privateKey, requestReauth],
  );

  const copyBlobId = useCallback((blobId: string) => {
    navigator.clipboard.writeText(blobId);
    setCopiedId(blobId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const exportAllToTxt = useCallback(async () => {
    // Create metadata text content
    const header = `WALRUS FILE RECOVERY GUIDE\n`;
    const timestamp = `Generated: ${new Date().toLocaleString()}\n`;
    const separator = `${"=".repeat(80)}\n\n`;

    const instructions = `HOW TO RECOVER YOUR FILES IF OUR SERVICE IS UNAVAILABLE:

This file contains all the information needed to download your files directly
from the Walrus decentralized storage network using the official Walrus CLI.

STEP 1: Install Walrus CLI
Visit: https://docs.walrus.site/usage/setup.html
Follow installation instructions for your operating system

STEP 2: Download a file
For unencrypted files:
  walrus read <Blob ID>

For encrypted files:
  walrus read <Blob ID> > encrypted.bin
  
Then decrypt using the file's decryption key with any AES-256-GCM tool.
The encrypted format is: E2E_ENCRYPTED | header | encrypted data
(See our GitHub repo for decryption script examples)

STEP 3: Alternative - Use share links
Each encrypted file has a "Decryption Key" listed below. You can:
  1. Download the encrypted blob: walrus read <Blob ID> > file.enc
  2. Use our open-source decryption script with the key
  3. Or access via share link (if our site is still available)

${"=".repeat(80)}

YOUR FILES:

`;

    const calculateExpiryInfo = (uploadedAt: string, epochs: number = 3) => {
      const uploadDate = new Date(uploadedAt);
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
      };
    };

    // Attempt to include decryption keys when available
    const user = authService.getCurrentUser();

    let content = "";
    for (let index = 0; index < items.length; index++) {
      const f = items[index];
      const expiry = calculateExpiryInfo(f.uploadedAt, f.epochs);
      content +=
        `[${index + 1}] ${f.name}\n` +
        `    Blob ID: ${f.blobId}\n` +
        `    Size: ${formatBytes(f.size)}\n` +
        `    Type: ${f.type || "Unknown"}\n` +
        `    Encrypted: ${f.encrypted ? "Yes (E2E)" : "No"}\n` +
        `    Uploaded: ${new Date(f.uploadedAt).toLocaleString()}\n` +
        `    Expires: ${expiry.expiryDate.toLocaleString()} (${expiry.daysRemaining}d remaining)\n` +
        `    Storage Epochs: ${f.epochs || 3}\n`;

      // If encrypted, include download instructions
      if (f.encrypted) {
        content += `    \n`;
        content += `    CLI Download: walrus read ${f.blobId} > ${f.name}.encrypted\n`;
        content += `    Note: Encrypted with HKDF-based encryption - requires master key for decryption\n`;
        content += `    Decryption: Use your 12-word seed phrase with decryption tool\n`;
      } else {
        content += `    CLI Download: walrus read ${f.blobId} > ${f.name}\n`;
      }

      content += "\n";
    }

    const summary =
      `\nSUMMARY\n` +
      `${"=".repeat(80)}\n` +
      `Total Files: ${items.length}\n` +
      `Total Size: ${formatBytes(items.reduce((sum, f) => sum + f.size, 0))}\n` +
      `Encrypted Files: ${items.filter((f) => f.encrypted).length}\n` +
      `Unencrypted Files: ${items.filter((f) => !f.encrypted).length}\n\n` +
      `IMPORTANT:\n` +
      `- Keep this file secure! It contains decryption keys for your encrypted files.\n` +
      `- Backup your recovery phrase separately (12 words from account creation).\n` +
      `- Files expire after ${items[0]?.epochs || 3} epochs (~${(items[0]?.epochs || 3) * 14} days).\n` +
      `- Renew storage epochs before expiration to prevent data loss.\n`;

    const fullContent =
      header + timestamp + separator + instructions + content + summary;

    // Create blob and download
    const blob = new Blob([fullContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `walrus-inventory-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [items]);

  const handleDelete = useCallback(
    (blobId: string, fileName: string, status?: UploadedFile["status"]) => {
      if (
        blobId.startsWith("temp_") ||
        status === "pending" ||
        status === "processing"
      ) {
        setDeleteError(
          "Delete not available. Please wait until the upload completes before deleting.",
        );
        setTimeout(() => setDeleteError(null), 5000);
        return;
      }

      setFileToDelete({ blobId, name: fileName });
      setDeleteDialogOpen(true);
      setDeleteError(null);
    },
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!fileToDelete) return;

    setDeletingId(fileToDelete.blobId);
    setDeleteError(null);
    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        setDeleteError("You must be logged in to delete files");
        return;
      }

      const res = await deleteBlob(fileToDelete.blobId, user.id);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }

      // Remove from localStorage cache
      removeCachedFile(fileToDelete.blobId);

      setDeleteDialogOpen(false);
      setFileToDelete(null);
      onFileDeleted?.();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }, [fileToDelete, onFileDeleted]);

  const downloadFile = useCallback(
    async (blobId: string, name?: string, encrypted?: boolean) => {
      setDownloadingId(blobId);
      try {
        const user = authService.getCurrentUser();

        // Check if user is still logged in
        if (!user?.id) {
          setDownloadError(
            "Your session has expired. Please log in again to download files.",
          );
          setTimeout(() => setDownloadError(null), 8000);
          setDownloadingId(null);
          return;
        }

        // Prevent download of encrypted files without encryption key
        if (encrypted && !privateKey) {
          setDownloadingId(null);

          // Prevent duplicate reauth requests
          if (waitingForReauthRef.current) {
            return;
          }

          waitingForReauthRef.current = true;
          // Store params in ref to avoid stale closure
          pendingDownloadRef.current = { blobId, name, encrypted };

          // Prompt for password to restore encryption key
          requestReauth(() => {
            waitingForReauthRef.current = false;
            // Retrieve params from ref and retry using the ref to get latest function
            const pending = pendingDownloadRef.current;
            if (pending && downloadFileRef.current) {
              pendingDownloadRef.current = null;
              // Call the latest version of downloadFile
              setTimeout(() => {
                downloadFileRef.current?.(
                  pending.blobId,
                  pending.name,
                  pending.encrypted,
                );
              }, 100);
            }
          });
          return;
        }

        const res = await downloadBlob(
          blobId,
          privateKey || "",
          name,
          user?.id,
        );
        if (!res.ok) {
          let detail = "Download failed";
          try {
            const payload = await res.json();
            detail = payload?.error ?? detail;
          } catch {}
          setDownloadError(detail);
          setTimeout(() => setDownloadError(null), 5000);
          return;
        }

        const blob = await res.blob();

        // If encrypted and we have a private key, try to decrypt
        if (encrypted && privateKey) {
          const result = await decryptWalrusBlob(
            blob,
            privateKey,
            name || blobId,
          );

          if (result) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(result.blob);
            a.download = result.suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
            return;
          } else {
            setDownloadError(
              "Decryption failed: The file could not be decrypted with your key. The file may have been encrypted with a different key.",
            );
            setTimeout(() => setDownloadError(null), 5000);
            return;
          }
        }

        // If we have privateKey but file wasn't marked as encrypted,
        // still try decryption (for files uploaded before metadata tracking)
        if (!encrypted && privateKey && blob.size > 0) {
          const result = await decryptWalrusBlob(
            blob,
            privateKey,
            name || blobId,
          );

          if (result) {
            // Successfully decrypted a file that wasn't marked as encrypted
            const a = document.createElement("a");
            a.href = URL.createObjectURL(result.blob);
            a.download = result.suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
            return;
          }
          // If decryption fails, fall through to download as-is
        }

        // Download as-is if not encrypted or decryption failed
        const filename = name?.trim() || blobId;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      } finally {
        setDownloadingId(null);
      }
    },
    [privateKey, requestReauth],
  );

  // Keep ref updated with latest downloadFile
  downloadFileRef.current = downloadFile;

  const formatDate = (dateString: string) => {
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
  };

  const calculateExpiryInfo = (uploadedAt: string, epochs: number = 3) => {
    const uploadDate = new Date(uploadedAt);
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
  };

  if (!items.length) {
    return (
      <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            Upload History
          </CardTitle>
          <CardDescription>
            Your recently uploaded files will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <HardDrive className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm text-muted-foreground">No uploads yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload files to see them here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              Upload History
            </CardTitle>
            <CardDescription>
              {items.length} file{items.length !== 1 ? "s" : ""} stored on
              Walrus
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={exportAllToTxt}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
          >
            <Download className="h-4 w-4" />
            Export Metadata
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((f) => (
            <div
              key={`${f.blobId}-${f.uploadedAt}`}
              className="group rounded-xl border border-blue-200/50 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {f.name}
                      </p>
                      {f.encrypted && (
                        <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.encrypted}>
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <Lock className="h-3 w-3" />
                            Encrypted
                          </span>
                        </StatusBadgeTooltip>
                      )}
                      {(() => {
                        // Determine storage location based on status
                        const isInWalrus = f.status === "completed";
                        const isInS3 =
                          f.s3Key !== null && f.s3Key !== undefined;

                        if (isInWalrus) {
                          return (
                            <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.walrus}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                Walrus
                              </span>
                            </StatusBadgeTooltip>
                          );
                        } else if (f.status === "processing") {
                          return (
                            <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.processing}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                                Processing
                              </span>
                            </StatusBadgeTooltip>
                          );
                        } else if (f.status === "failed") {
                          return (
                            <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.failed}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                <AlertCircle className="h-3 w-3" />
                                Failed
                              </span>
                            </StatusBadgeTooltip>
                          );
                        } else if (isInS3) {
                          return (
                            <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.s3}>
                              <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                <HardDrive className="h-3 w-3" />
                                S3
                              </span>
                            </StatusBadgeTooltip>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    {/* Folder path display */}
                    {f.folderPath && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Folder className="h-3 w-3" />
                        <span>{f.folderPath}</span>
                      </div>
                    )}

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatBytes(f.size)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(f.uploadedAt)}
                      </span>
                      {(() => {
                        const expiry = calculateExpiryInfo(
                          f.uploadedAt,
                          f.epochs,
                        );
                        return (
                          <>
                            <span>•</span>
                            <span
                              className={`flex items-center gap-1 ${
                                expiry.isExpired
                                  ? "text-red-600 dark:text-red-400"
                                  : expiry.daysRemaining < 30
                                    ? "text-orange-600 dark:text-orange-400"
                                    : "text-blue-600 dark:text-blue-400"
                              }`}
                            >
                              <Clock className="h-3 w-3" />
                              {expiry.isExpired
                                ? "Expired"
                                : `${expiry.daysRemaining}d left`}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 3-dot menu button */}
                  <div className="relative">
                    <button
                      onClick={() =>
                        setOpenMenuId(openMenuId === f.blobId ? null : f.blobId)
                      }
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      title="More actions"
                    >
                      <MoreVertical className="h-4 w-4 text-gray-500" />
                    </button>

                    {/* Dropdown menu */}
                    {openMenuId === f.blobId && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 py-1 min-w-[160px]">
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            setSelectedFile(f);
                            setExtendDialogOpen(true);
                            setOpenMenuId(null);
                          }}
                        >
                          <CalendarPlus className="h-4 w-4" />
                          Extend Duration
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            setFileToMove({
                              blobId: f.blobId,
                              name: f.name,
                              currentFolderId: f.folderId,
                            });
                            setMoveDialogOpen(true);
                            setOpenMenuId(null);
                          }}
                        >
                          <FolderInput className="h-4 w-4" />
                          Organize (Into Folder)
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-slate-700 text-left"
                          onClick={() => {
                            copyBlobId(f.blobId);
                            setOpenMenuId(null);
                          }}
                        >
                          <Info className="h-4 w-4" />
                          Copy ID
                        </button>
                        <hr className="my-1 border-zinc-800" />
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-destructive-20 text-destructive text-left"
                          onClick={() => {
                            handleDelete(f.blobId, f.name, f.status);
                            setOpenMenuId(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 dark:bg-slate-900/50">
                  <p className="flex-1 break-all font-mono text-xs text-gray-600 dark:text-gray-400">
                    {f.blobId}
                  </p>
                  <button
                    onClick={() => copyBlobId(f.blobId)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                    title="Copy ID"
                  >
                    {copiedId === f.blobId ? (
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => downloadFile(f.blobId, f.name, f.encrypted)}
                    disabled={
                      downloadingId === f.blobId || deletingId === f.blobId
                    }
                    className="flex-[2] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-70"
                  >
                    {downloadingId === f.blobId ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </>
                    )}
                  </Button>
                  <div className="flex-[2] flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedFile(f);
                        setExtendDialogOpen(true);
                      }}
                      disabled={
                        downloadingId === f.blobId || deletingId === f.blobId
                      }
                      className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700"
                      title="Extend storage duration"
                    >
                      <CalendarPlus className="mr-2 h-3 w-3" />
                      Extend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleShare(f.blobId, f.name)}
                      disabled={
                        downloadingId === f.blobId || deletingId === f.blobId
                      }
                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-300 dark:bg-green-900/20 dark:hover:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                      title={
                        f.encrypted
                          ? "Create secure share link"
                          : "Create share link"
                      }
                    >
                      <Share2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(f.blobId, f.name, f.status)}
                    disabled={
                      deletingId === f.blobId || downloadingId === f.blobId
                    }
                    className="bg-destructive hover:bg-destructive-dark disabled:opacity-70 text-destructive-foreground"
                  >
                    {deletingId === f.blobId ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </>
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Share Dialog */}
      {shareFile && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setShareFile(null);
          }}
          blobId={shareFile.blobId}
          filename={shareFile.filename}
          encrypted={shareFile.encrypted}
          uploadedAt={shareFile.uploadedAt}
          epochs={shareFile.epochs}
        />
      )}

      {/* Extend Duration Dialog */}
      {selectedFile && (
        <ExtendDurationDialog
          open={extendDialogOpen}
          onOpenChange={setExtendDialogOpen}
          blobId={selectedFile.blobId}
          fileName={selectedFile.name}
          fileSize={selectedFile.size}
          currentEpochs={selectedFile.epochs}
          onSuccess={() => {
            // Refresh the upload list
            onFileDeleted?.();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {fileToDelete && (
        <>
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) {
                setFileToDelete(null);
                setDeleteError(null);
              }
            }}
            fileName={fileToDelete.name}
            onConfirm={confirmDelete}
          />
          {deleteError && deleteDialogOpen && (
            <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)]">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-emerald-100">
                    Delete Failed
                  </p>
                  <p className="text-sm text-emerald-100/80 mt-1">
                    {deleteError}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Download Error Notification */}
      {downloadError && (
        <div className="fixed bottom-4 right-4 z-[60] max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                Download Failed
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {downloadError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Share Error Notification */}
      {shareError && (
        <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">
                Share Not Available
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">{shareError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Move File Dialog */}
      {fileToMove && (
        <MoveFileDialog
          open={moveDialogOpen}
          onClose={() => {
            setMoveDialogOpen(false);
            setFileToMove(null);
          }}
          files={[fileToMove]}
          onFileMoved={() => {
            onFileDeleted?.(); // Refresh the file list
          }}
        />
      )}

      {/* Click outside handler to close dropdown menu */}
      {openMenuId && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenMenuId(null)}
        />
      )}
    </Card>
  );
}
