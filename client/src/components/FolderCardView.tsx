import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  MoreVertical,
  Pencil,
  Trash2,
  FileText,
  Lock,
  LockOpen,
  HardDrive,
  Calendar,
  Clock,
  Download,
  Share2,
  Star,
  CalendarPlus,
  FolderInput,
  Info,
  Copy,
  Check,
  Upload,
  Loader2,
  AlertCircle,
  Home,
  QrCode,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";
import { downloadBlob, deleteBlob, uploadBlob } from "../services/walrusApi";
import { decryptWalrusBlob } from "../services/decryptWalrusBlob";
import { removeCachedFile } from "../lib/fileCache";
import { ExtendDurationDialog } from "./ExtendDurationDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { ShareDialog } from "./ShareDialog";
import { PaymentApprovalDialog } from "./PaymentApprovalDialog";
import MoveFileDialog from "./MoveFileDialog";
import CreateFolderDialog from "./CreateFolderDialog";
import {
  deriveKEK,
  unwrapFileKey,
  exportFileKeyForShare,
} from "../services/fileKeyManagement";
import {
  decryptWithFileKey,
  encryptWithPerFileKey,
  importFileKeyFromShare,
} from "../services/crypto";

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  fileCount: number;
  childCount: number;
  children: FolderNode[];
};

export type FileItem = {
  blobId: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  uploadedAt: string;
  epochs?: number;
  status?: "pending" | "processing" | "completed" | "failed";
  s3Key?: string | null;
  folderId?: string | null;
  folderPath?: string | null;
  wrappedFileKey?: string | null;
  starred?: boolean;
};

interface FolderCardViewProps {
  files: FileItem[];
  currentFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFileDeleted?: () => void;
  onFileMoved?: () => void;
  onFolderDeleted?: () => void;
  onFolderCreated?: () => void;
  onUploadClick: () => void;
  currentView?: "all" | "recents" | "shared" | "expiring" | "starred";
  sharedFiles?: any[];
  onSharedFilesRefresh?: () => void;
  folderRefreshKey?: number;
  onStarToggle?: (blobId: string, starred: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function truncateFileName(name: string, maxLength: number = 70): string {
  if (name.length <= maxLength) return name;
  return `${name.slice(0, Math.max(0, maxLength - 3))}...`;
}

export default function FolderCardView({
  files,
  currentFolderId,
  onFolderChange,
  onFileDeleted,
  onFileMoved,
  onFolderDeleted,
  onFolderCreated,
  onUploadClick,
  currentView = "all",
  sharedFiles = [],
  onSharedFilesRefresh,
  folderRefreshKey,
  onStarToggle,
}: FolderCardViewProps) {
  const { privateKey, requestReauth } = useAuth();
  const navigate = useNavigate();
  const [savedSharedFiles, setSavedSharedFiles] = useState<any[]>([]);
  const [loadingSavedShares, setLoadingSavedShares] = useState(false);
  const [starredFiles, setStarredFiles] = useState<FileItem[]>([]);
  const [loadingStarred, setLoadingStarred] = useState(false);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderPath, setFolderPath] = useState<
    { id: string | null; name: string }[]
  >([{ id: null, name: "My Files" }]);

  // File action states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [savingSharedId, setSavingSharedId] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [fileForPayment, setFileForPayment] = useState<File | null>(null);
  const [isUploadingAfterPayment, setIsUploadingAfterPayment] = useState(false);
  const [pendingFileUpload, setPendingFileUpload] = useState<{
    fileBlob: Blob;
    fileName: string;
    contentType: string;
    epochs: number;
  } | null>(null);
  const [shareActiveId, setShareActiveId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedShareLinkId, setCopiedShareLinkId] = useState<string | null>(
    null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Map of freshest statuses fetched from server for files (blobId -> status)
  const [fileStatusMap, setFileStatusMap] = useState<Map<string, string>>(
    new Map(),
  );
  // Map of updated blobIds from server (oldBlobId -> newBlobId)
  const [fileBlobIdMap, setFileBlobIdMap] = useState<Map<string, string>>(
    new Map(),
  );
  const [starredMap, setStarredMap] = useState<Map<string, boolean>>(new Map());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [fileMenuPosition, setFileMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [folderMenuPosition, setFolderMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const folderButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Dialogs
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{
    blobId: string;
    name: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFile, setShareFile] = useState<{
    blobId: string;
    filename: string;
    wrappedFileKey: string | null;
    uploadedAt?: string;
    epochs?: number;
  } | null>(null);
  const [showQRForBlobId, setShowQRForBlobId] = useState<string | null>(null);
  const [qrDataUrls, setQrDataUrls] = useState<Map<string, string>>(new Map());
  const [qrSourceUrls, setQrSourceUrls] = useState<Map<string, string>>(
    new Map(),
  );
  const [fullShareUrls, setFullShareUrls] = useState<Map<string, string>>(
    new Map(),
  );
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [fileToMove, setFileToMove] = useState<{
    blobId: string;
    name: string;
    currentFolderId?: string | null;
  } | null>(null);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!shareDialogOpen) {
      setShareActiveId(null);
    }
  }, [shareDialogOpen]);

  useEffect(() => {
    const next = new Map<string, boolean>();
    files.forEach((f) => {
      if (typeof f.starred === "boolean") {
        next.set(f.blobId, f.starred);
      }
    });
    setStarredMap(next);
  }, [files]);

  // Folder editing
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  // Generate full share URLs for encrypted files
  useEffect(() => {
    const combinedSharedFiles =
      currentView === "shared"
        ? [...sharedFiles, ...savedSharedFiles]
        : sharedFiles;
    const seenBlobIds = new Set<string>();
    const effectiveSharedFiles = combinedSharedFiles.filter((share) => {
      const blobId = share?.blobId as string | undefined;
      if (!blobId || seenBlobIds.has(blobId)) return false;
      seenBlobIds.add(blobId);
      return true;
    });

    if (
      currentView === "shared" &&
      effectiveSharedFiles.length > 0 &&
      privateKey
    ) {
      effectiveSharedFiles.forEach(async (shareInfo) => {
        if (
          shareInfo.encrypted &&
          shareInfo.wrappedFileKey &&
          !fullShareUrls.has(shareInfo.blobId)
        ) {
          try {
            const { deriveKEK, unwrapFileKey, exportFileKeyForShare } =
              await import("../services/fileKeyManagement");
            const kek = await deriveKEK(privateKey);
            const fileKey = await unwrapFileKey(shareInfo.wrappedFileKey, kek);
            const fileKeyBase64url = await exportFileKeyForShare(fileKey);
            const fullUrl = `${window.location.origin}/s/${shareInfo.shareId}#k=${fileKeyBase64url}`;
            setFullShareUrls((prev) =>
              new Map(prev).set(shareInfo.blobId, fullUrl),
            );
          } catch (err) {
            console.error("Failed to extract file key for share link:", err);
            const baseUrl = `${window.location.origin}/s/${shareInfo.shareId}`;
            setFullShareUrls((prev) =>
              new Map(prev).set(shareInfo.blobId, baseUrl),
            );
          }
        } else if (
          !shareInfo.encrypted &&
          !fullShareUrls.has(shareInfo.blobId)
        ) {
          const baseUrl = `${window.location.origin}/s/${shareInfo.shareId}`;
          setFullShareUrls((prev) =>
            new Map(prev).set(shareInfo.blobId, baseUrl),
          );
        }
      });
    }
  }, [currentView, sharedFiles, savedSharedFiles, privateKey, fullShareUrls]);

  // Load both user's own shares and saved shares for the shared view
  useEffect(() => {
    if (currentView !== "shared") return;

    const loadAllShares = async () => {
      const user = authService.getCurrentUser();
      if (!user?.id) return;

      setLoadingSavedShares(true);
      try {
        const [userSharesRes, savedSharesRes] = await Promise.all([
          fetch(apiUrl(`/api/shares/user?userId=${user.id}`)),
          fetch(apiUrl(`/api/shares/saved?userId=${user.id}`)),
        ]);

        const allShares: any[] = [];

        if (userSharesRes.ok) {
          const userSharesData = await userSharesRes.json();
          allShares.push(...(userSharesData.shares || []));
        } else {
          console.error(userSharesRes.status);
        }

        if (savedSharesRes.ok) {
          const savedSharesData = await savedSharesRes.json();
          allShares.push(...(savedSharesData.savedShares || []));
        } else {
        }
        setSavedSharedFiles(allShares);
      } catch (err) {
        setSavedSharedFiles([]);
      } finally {
        setLoadingSavedShares(false);
      }
    };

    loadAllShares();
  }, [currentView]);

  const fetchFolders = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    try {
      const res = await fetch(apiUrl(`/api/folders?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders);
      }
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Refresh folders when folderRefreshKey changes (triggered by file moves, folder creates/deletes)
  useEffect(() => {
    if (folderRefreshKey !== undefined && folderRefreshKey > 0) {
      fetchFolders();
    }
  }, [folderRefreshKey, fetchFolders]);

  // Build folder path when current folder changes
  useEffect(() => {
    if (currentFolderId === null) {
      setFolderPath([{ id: null, name: "My Files" }]);
      return;
    }

    // Find folder and build path
    const buildPath = (
      folderId: string,
      allFolders: FolderNode[],
    ): { id: string | null; name: string }[] => {
      const findFolder = (
        id: string,
        folders: FolderNode[],
      ): FolderNode | null => {
        for (const f of folders) {
          if (f.id === id) return f;
          const child = findFolder(id, f.children);
          if (child) return child;
        }
        return null;
      };

      const folder = findFolder(folderId, allFolders);
      if (!folder) return [{ id: null, name: "My Files" }];

      const path: { id: string | null; name: string }[] = [
        { id: null, name: "My Files" },
      ];

      // Build path by traversing up
      const buildParentPath = (
        f: FolderNode,
        allFolders: FolderNode[],
      ): string[] => {
        if (!f.parentId) return [f.name];
        const parent = findFolder(f.parentId, allFolders);
        if (!parent) return [f.name];
        return [...buildParentPath(parent, allFolders), f.name];
      };

      const names = buildParentPath(folder, allFolders);
      let currentId: string | null = null;

      // Re-find IDs for each path segment
      const findIdByPath = (
        pathNames: string[],
        folders: FolderNode[],
        parentId: string | null,
      ): { id: string | null; name: string }[] => {
        const result: { id: string | null; name: string }[] = [];
        let currentParent = parentId;

        for (const name of pathNames) {
          const findInLevel = (
            folders: FolderNode[],
            parent: string | null,
          ): FolderNode | null => {
            for (const f of folders) {
              if (f.name === name && f.parentId === parent) return f;
              const child = findInLevel(f.children, parent);
              if (child) return child;
            }
            return null;
          };

          const found = findInLevel(folders, currentParent);
          if (found) {
            result.push({ id: found.id, name: found.name });
            currentParent = found.id;
          }
        }
        return result;
      };

      return [
        { id: null, name: "My Files" },
        ...findIdByPath(names, allFolders, null),
      ];
    };

    setFolderPath(buildPath(currentFolderId, folders));
  }, [currentFolderId, folders]);

  // Get folders at current level (only show in 'all' view)
  const currentLevelFolders =
    currentView === "all"
      ? currentFolderId === null
        ? folders.filter((f) => f.parentId === null)
        : folders.flatMap((f) => {
            const findChildren = (folder: FolderNode): FolderNode[] => {
              if (folder.id === currentFolderId) return folder.children;
              return folder.children.flatMap(findChildren);
            };
            return findChildren(f);
          })
      : []; // Hide folders in special views

  const combinedSharedFiles =
    currentView === "shared"
      ? [...sharedFiles, ...savedSharedFiles]
      : sharedFiles;
  const seenSharedBlobIds = new Set<string>();
  const effectiveSharedFiles = combinedSharedFiles.filter((share) => {
    const blobId = share?.blobId as string | undefined;
    if (!blobId || seenSharedBlobIds.has(blobId)) return false;
    seenSharedBlobIds.add(blobId);
    return true;
  });

  const derivedSharedFiles =
    currentView === "shared" ? effectiveSharedFiles : [];

  const derivedSharedFileItems: FileItem[] =
    currentView === "shared"
      ? derivedSharedFiles.map((share: any) => ({
          blobId: share.blobId,
          name: share.filename,
          size: share.originalSize,
          type: share.contentType || "application/octet-stream",
          encrypted: !!share.encrypted,
          uploadedAt: share.uploadedAt || share.savedAt,
          epochs: share.epochs || undefined,
          folderId: null,
          wrappedFileKey: share.wrappedFileKey,
          status: "completed" as const,
        }))
      : [];

  const currentUserId = authService.getCurrentUser()?.id || null;
  const sharedByYouFiles =
    currentView === "shared"
      ? derivedSharedFileItems.filter((file) => {
          const shareInfo = derivedSharedFiles.find(
            (s: any) => s.blobId === file.blobId,
          );
          return shareInfo?.uploadedBy === currentUserId;
        })
      : [];
  const sharedByOthersFiles =
    currentView === "shared"
      ? derivedSharedFileItems.filter((file) => {
          const shareInfo = derivedSharedFiles.find(
            (s: any) => s.blobId === file.blobId,
          );
          return shareInfo?.uploadedBy !== currentUserId;
        })
      : [];

  useEffect(() => {
    if (currentView !== "starred") {
      setStarredFiles([]);
      setLoadingStarred(false);
      return;
    }

    const user = authService.getCurrentUser();
    if (!user?.id) {
      setStarredFiles([]);
      setLoadingStarred(false);
      return;
    }

    const loadStarred = async () => {
      setLoadingStarred(true);
      try {
        const res = await fetch(
          apiUrl(`/api/cache?userId=${user.id}&starred=true`),
        );
        if (res.ok) {
          const data = await res.json();
          const filesFromCache: FileItem[] = data.files.map((f: any) => ({
            blobId: f.blobId,
            name: f.filename,
            size: f.originalSize,
            type: f.contentType || "",
            encrypted: f.encrypted,
            uploadedAt: f.uploadedAt,
            epochs: f.epochs,
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
        } else {
          setStarredFiles([]);
        }
      } catch (err) {
        console.error("Failed to load starred files:", err);
        setStarredFiles([]);
      } finally {
        setLoadingStarred(false);
      }
    };

    loadStarred();
  }, [currentView]);

  const effectiveFiles =
    currentView === "shared"
      ? derivedSharedFileItems
      : currentView === "starred"
        ? starredFiles
        : files;

  // Get files at current level
  const currentLevelFiles =
    currentView === "all"
      ? effectiveFiles.filter((f) => f.folderId === currentFolderId)
      : effectiveFiles; // In special views, show all filtered files (filtering done in App.tsx)

  const handleFolderClick = (folderId: string) => {
    onFolderChange(folderId);
  };

  const handleShare = useCallback(
    async (blobId: string, filename: string, skipReauthCheck = false) => {
      // Check for session key - trigger reauth if missing
      if (!skipReauthCheck && (!privateKey || privateKey.trim() === "")) {
        requestReauth(() => {
          // Retry share after reauth, skip check this time
          handleShare(blobId, filename, true);
        });
        setShareActiveId(null);
        return;
      }

      try {
        const user = authService.getCurrentUser();
        if (!user?.id) {
          alert("You must be logged in to share files");
          setShareActiveId(null);
          return;
        }

        const response = await fetch(
          apiUrl(`/api/files/${blobId}?userId=${user.id}`),
        );

        const fileData = await response.json();

        // Keep a freshest-per-file status map so UI can reflect completed state quickly
        if (fileData.status) {
          setFileStatusMap((prev) => {
            const next = new Map(prev);
            next.set(blobId, fileData.status);
            return next;
          });
        }

        if (
          fileData.status &&
          (fileData.status === "processing" || fileData.status === "pending")
        ) {
          setShareError(
            "This file is still being uploaded to Walrus. Please wait until the upload is complete before sharing.",
          );
          setTimeout(() => setShareError(null), 5000);
          setShareActiveId(null);
          return;
        }

        if (fileData.status === "failed") {
          setShareError(
            "This file has failed to upload to Walrus. Please wait for server to retry before sharing.",
          );
          setTimeout(() => setShareError(null), 5000);
          setShareActiveId(null);
          return;
        }

        // Check if file still has temp blobId (incomplete Walrus upload)
        if (blobId.startsWith("temp_")) {
          setShareError(
            "This file is still being uploaded to Walrus. Please wait until the upload is complete before sharing.",
          );
          setTimeout(() => setShareError(null), 5000);
          setShareActiveId(null);
          return;
        }

        setShareFile({
          blobId,
          filename,
          wrappedFileKey: fileData.wrappedFileKey,
          uploadedAt: fileData.uploadedAt,
          epochs: fileData.epochs,
        });
        setShareDialogOpen(true);
      } catch (err: any) {
        console.error("[handleShare] Error:", err);
        setShareError("Failed to prepare file for sharing");
        setTimeout(() => setShareError(null), 5000);
        setShareActiveId(null);
      }
    },
    [privateKey, requestReauth],
  );

  const handleToggleStar = useCallback(
    async (blobId: string, nextStarred: boolean) => {
      const user = authService.getCurrentUser();
      if (!user?.id) return;

      try {
        const res = await fetch(apiUrl(`/api/cache/${blobId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, starred: nextStarred }),
        });

        if (!res.ok) {
          throw new Error("Failed to update star");
        }

        setStarredMap((prev) => {
          const next = new Map(prev);
          next.set(blobId, nextStarred);
          return next;
        });

        onStarToggle?.(blobId, nextStarred);

        if (currentView === "starred" && !nextStarred) {
          setStarredFiles((prev) => prev.filter((f) => f.blobId !== blobId));
        }
      } catch (err) {
        console.error("Failed to update star:", err);
      }
    },
    [currentView, onStarToggle],
  );

  const copyBlobId = useCallback((blobId: string) => {
    navigator.clipboard.writeText(blobId);
    setCopiedId(blobId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleDelete = useCallback((blobId: string, fileName: string) => {
    setFileToDelete({ blobId, name: fileName });
    setDeleteDialogOpen(true);
    setDeleteError(null);
  }, []);

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

      removeCachedFile(fileToDelete.blobId);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      onFileDeleted?.();
    } catch (err: any) {
      console.error("[confirmDelete] Error:", err);
      setDeleteError("Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }, [fileToDelete, onFileDeleted]);

  // Auto-trigger background processing for pending files
  useEffect(() => {
    const hasPendingFiles = files.some((f) => f.status === "pending");
    if (!hasPendingFiles) return;

    const triggerProcessing = async () => {
      try {
        await fetch(apiUrl("/api/upload/trigger-pending"), {
          method: "POST",
        });
      } catch (err) {
        console.error("[triggerPending] ", err);
      }
    };

    // Trigger immediately and then every 15 seconds while pending files exist
    triggerProcessing();
    const iv = window.setInterval(triggerProcessing, 15000);
    return () => clearInterval(iv);
  }, [files]);

  // Poll pending/processing files so the badge updates shortly after server completes them
  useEffect(() => {
    let mounted = true;

    const fetchStatuses = async () => {
      const idsToPoll = files
        .filter((f) => f.status === "pending" || f.status === "processing")
        .map((f) => f.blobId);
      if (idsToPoll.length === 0) return;
      const user = authService.getCurrentUser();
      if (!user?.id) return;

      await Promise.all(
        idsToPoll.map(async (id) => {
          try {
            const res = await fetch(
              apiUrl(`/api/files/${id}?userId=${user.id}`),
            );
            if (!mounted) return;
            if (res.ok) {
              const data = await res.json();
              if (data.status) {
                setFileStatusMap((prev) => {
                  const next = new Map(prev);
                  next.set(id, data.status);
                  return next;
                });
              }
              // Track blobId changes (temp -> real Walrus ID)
              if (data.blobId && data.blobId !== id) {
                setFileBlobIdMap((prev) => {
                  const next = new Map(prev);
                  next.set(id, data.blobId);
                  return next;
                });
              }
            }
          } catch (err) {
            console.error("[pollFileStatus] ", err);
          }
        }),
      );
    };

    fetchStatuses();
    const iv = window.setInterval(fetchStatuses, 3000);
    return () => {
      mounted = false;
      clearInterval(iv);
    };
  }, [files, folderRefreshKey]);

  const downloadFile = useCallback(
    async (
      blobId: string,
      name?: string,
      encrypted?: boolean,
      skipReauthCheck = false,
    ) => {
      // Check for session key - trigger reauth if missing
      if (!skipReauthCheck && (!privateKey || privateKey.trim() === "")) {
        requestReauth(() => {
          // Retry download after reauth, skip check this time
          downloadFile(blobId, name, encrypted, true);
        });
        return;
      }

      setDownloadingId(blobId);
      try {
        const user = authService.getCurrentUser();

        let wrappedFileKey: string | undefined;
        if (encrypted && user?.id) {
          try {
            const metadataRes = await fetch(
              apiUrl(`/api/files/${blobId}?userId=${user.id}`),
            );
            if (metadataRes.ok) {
              const metadata = await metadataRes.json();
              wrappedFileKey = metadata.wrappedFileKey;
            }
          } catch (err) {
            console.warn("[downloadFile] Failed to fetch wrappedFileKey:", err);
          }
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

        if (encrypted && privateKey) {
          const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, "");
          const result = await decryptWalrusBlob(
            blob,
            privateKey,
            baseName,
            wrappedFileKey,
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
              "Decryption failed: The file could not be decrypted with your key.",
            );
            setTimeout(() => setDownloadError(null), 5000);
            return;
          }
        }

        if (!encrypted && privateKey && blob.size > 0) {
          const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, "");
          const result = await decryptWalrusBlob(
            blob,
            privateKey,
            baseName,
            wrappedFileKey,
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
          }
        }

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
  };

  const renderFileRow = (f: FileItem) => {
    const expiry = calculateExpiryInfo(f.uploadedAt, f.epochs);
    const isExpiringSoon =
      expiry.daysRemaining <= 10 && expiry.daysRemaining > 0;
    const shareInfo =
      currentView === "shared"
        ? derivedSharedFiles.find((s) => s.blobId === f.blobId)
        : null;
    const isSharedByOthers =
      currentView === "shared" && shareInfo?.uploadedBy !== currentUserId;
    const getStoredShareKey = (shareId?: string | null) => {
      if (!shareId) return "";
      try {
        return (
          localStorage.getItem(`walrus_share_key:${shareId}`) ||
          sessionStorage.getItem(`walrus_share_key:${shareId}`) ||
          ""
        );
      } catch {
        return "";
      }
    };

    const displayStatus = fileStatusMap.get(f.blobId) ?? f.status;
    const displayBlobId = fileBlobIdMap.get(f.blobId) ?? f.blobId;
    const isStarred = starredMap.get(f.blobId) ?? f.starred ?? false;

    const handleDownloadShared = async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (!shareInfo) return;

      setDownloadingId(f.blobId);
      try {
        const shareKey = shareInfo.encrypted
          ? getStoredShareKey(shareInfo.shareId)
          : "";
        if (shareInfo.encrypted && !shareKey) {
          setShareError(
            "Missing encryption key for this shared file. Open the share link once to store the key.",
          );
          setTimeout(() => setShareError(null), 5000);
          return;
        }

        const response = await fetch(apiUrl("/api/download"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobId: shareInfo.blobId,
            filename: shareInfo.filename || f.name,
            shareId: shareInfo.shareId,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Download failed");
        }

        const blob = await response.blob();

        if (shareInfo.encrypted) {
          const fileKey = await importFileKeyFromShare(shareKey);
          const decryptResult = await decryptWithFileKey(
            blob,
            fileKey,
            shareInfo.filename || f.name,
          );

          if (!decryptResult)
            throw new Error(
              "Decryption failed - invalid key or corrupted file",
            );

          const url = URL.createObjectURL(decryptResult.blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = decryptResult.suggestedName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = shareInfo.filename || f.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
        }
      } catch (err: any) {
        console.error("[handleDownloadShared] Error:", err);
        setShareError("Download failed");
        setTimeout(() => setShareError(null), 5000);
      } finally {
        setDownloadingId(null);
      }
    };

    const handleSaveShared = async (skipReauthCheck = false) => {
      if (!shareInfo) return;

      if (!skipReauthCheck && (!privateKey || privateKey.trim() === "")) {
        requestReauth(() => handleSaveShared(true));
        return;
      }

      setSavingSharedId(f.blobId);
      try {
        const user = authService.getCurrentUser();
        if (!user?.id) {
          setShareError("You must be logged in to save files");
          setTimeout(() => setShareError(null), 5000);
          return;
        }

        const shareKey = shareInfo.encrypted
          ? getStoredShareKey(shareInfo.shareId)
          : "";
        if (shareInfo.encrypted && !shareKey) {
          setShareError(
            "Missing encryption key for this shared file. Open the share link once to store the key.",
          );
          setTimeout(() => setShareError(null), 5000);
          return;
        }

        const response = await fetch(apiUrl("/api/download"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blobId: shareInfo.blobId,
            filename: shareInfo.filename || f.name,
            shareId: shareInfo.shareId,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Download failed");
        }

        const blob = await response.blob();
        let fileBlob = blob;
        let fileName = shareInfo.filename || f.name;

        if (shareInfo.encrypted) {
          const fileKey = await importFileKeyFromShare(shareKey);
          const decryptResult = await decryptWithFileKey(
            blob,
            fileKey,
            fileName,
          );

          if (!decryptResult)
            throw new Error(
              "Decryption failed - invalid key or corrupted file",
            );

          fileBlob = decryptResult.blob;
          fileName = decryptResult.suggestedName;
        }

        // Store file data for payment approval
        setPendingFileUpload({
          fileBlob,
          fileName,
          contentType: shareInfo.contentType || "application/octet-stream",
          epochs: shareInfo.epochs || 3,
        });

        // Create a File object for the payment dialog
        const fileToPayment = new File([fileBlob], fileName, {
          type: shareInfo.contentType || "application/octet-stream",
        });
        setFileForPayment(fileToPayment);
        setPaymentDialogOpen(true);
      } catch (err: any) {
        console.error("[handleSaveShared] Error:", err);
        setShareError("Failed to save file");
        setTimeout(() => setShareError(null), 5000);
      } finally {
        setSavingSharedId(null);
      }
    };

    return (
      <div
        key={f.blobId}
        className={`group relative rounded-xl border p-4 shadow-sm transition-all hover:shadow-md w-full ${
          isExpiringSoon && currentView === "expiring"
            ? "border-emerald-800/50 bg-emerald-950/40 hover:border-emerald-700"
            : currentView === "shared"
              ? "border-emerald-800/50 bg-emerald-950/40 hover:border-emerald-700"
              : currentView === "recents"
                ? "border-emerald-800/50 bg-emerald-950/30 hover:border-emerald-700"
                : "border-emerald-800/50 bg-emerald-950/30 hover:border-emerald-700"
        }`}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpenMenuId(f.blobId);
          setFileMenuPosition({
            top: e.clientY + 4,
            left: e.clientX + 4,
          });
        }}
      >
        <div className="flex items-start gap-3 w-full">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
            {f.encrypted ? (
              <Lock className="h-5 w-5 text-green-400" />
            ) : (
              <LockOpen className="h-5 w-5 text-gray-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-100 truncate">
                {truncateFileName(f.name)}
              </p>
              {displayStatus && (
                <span className="inline-flex items-center gap-1 ml-2">
                  {displayStatus === "completed" &&
                    !displayBlobId.startsWith("temp_") && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        <HardDrive className="h-3 w-3" />
                        Walrus
                      </span>
                    )}

                  {(displayStatus === "processing" ||
                    displayStatus === "pending" ||
                    (displayStatus === "completed" &&
                      displayBlobId.startsWith("temp_"))) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processing
                    </span>
                  )}

                  {displayStatus === "failed" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      <AlertCircle className="h-3 w-3" />
                      Pending
                    </span>
                  )}
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-300">
              <span>{formatBytes(f.size)}</span>
              <span>•</span>
              <span>{formatDate(f.uploadedAt)}</span>
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
                {expiry.isExpired ? "Expired" : `${expiry.daysRemaining}d left`}
              </span>
              {shareInfo &&
                currentView === "shared" &&
                (() => {
                  const shareExpiryDate = shareInfo.expiresAt
                    ? new Date(shareInfo.expiresAt)
                    : null;
                  const now = new Date();
                  const shareDaysRemaining = shareExpiryDate
                    ? Math.ceil(
                        (shareExpiryDate.getTime() - now.getTime()) /
                          (24 * 60 * 60 * 1000),
                      )
                    : null;
                  return (
                    <>
                      <span>•</span>
                      <span
                        className={`font-medium ${
                          shareDaysRemaining !== null
                            ? shareDaysRemaining <= 1
                              ? "text-red-600 dark:text-red-400"
                              : shareDaysRemaining <= 7
                                ? "text-orange-600 dark:text-orange-400"
                                : "text-white"
                            : "text-white"
                        }`}
                      >
                        Link Valid:{" "}
                        {shareDaysRemaining !== null
                          ? shareDaysRemaining > 0
                            ? `${shareDaysRemaining}d`
                            : "Expired"
                          : "Never expires"}
                      </span>
                    </>
                  );
                })()}
            </div>

            {/* Share action buttons for Shared view - Copy Link/QR for files shared by you, Download/Save for files shared by others */}
            {shareInfo &&
              currentView === "shared" &&
              (() => {
                const getFullShareUrl = async (options?: {
                  forceRefresh?: boolean;
                }) => {
                  const needsKey =
                    shareInfo.encrypted && !!shareInfo.wrappedFileKey;
                  const effectivePrivateKey = (() => {
                    if (privateKey) return privateKey;
                    try {
                      return sessionStorage.getItem("walrus_session_key") || "";
                    } catch {
                      return "";
                    }
                  })();
                  const cachedUrl = fullShareUrls.get(f.blobId);
                  const cachedHasKey = cachedUrl?.includes("#k=") ?? false;

                  if (!options?.forceRefresh) {
                    if (cachedUrl && (!needsKey || cachedHasKey)) {
                      return cachedUrl;
                    }

                    if (cachedUrl && needsKey && !effectivePrivateKey) {
                      return cachedUrl;
                    }
                  }

                  let shareUrl = `${window.location.origin}/s/${shareInfo.shareId}`;

                  if (needsKey && effectivePrivateKey && !isSharedByOthers) {
                    try {
                      const {
                        deriveKEK,
                        unwrapFileKey,
                        exportFileKeyForShare,
                      } = await import("../services/fileKeyManagement");
                      const kek = await deriveKEK(effectivePrivateKey);
                      const fileKey = await unwrapFileKey(
                        shareInfo.wrappedFileKey,
                        kek,
                      );
                      const fileKeyBase64url =
                        await exportFileKeyForShare(fileKey);
                      shareUrl = `${shareUrl}#k=${fileKeyBase64url}`;
                      setFullShareUrls((prev) =>
                        new Map(prev).set(f.blobId, shareUrl),
                      );
                    } catch (err) {
                      console.error(
                        "Failed to extract file key for share link:",
                        err,
                      );
                      setFullShareUrls((prev) =>
                        new Map(prev).set(f.blobId, shareUrl),
                      );
                    }
                  } else if (needsKey) {
                    const storedKey = getStoredShareKey(shareInfo.shareId);
                    if (storedKey) {
                      shareUrl = `${shareUrl}#k=${storedKey}`;
                      setFullShareUrls((prev) =>
                        new Map(prev).set(f.blobId, shareUrl),
                      );
                    }
                  } else if (!needsKey) {
                    setFullShareUrls((prev) =>
                      new Map(prev).set(f.blobId, shareUrl),
                    );
                  }

                  return shareUrl;
                };

                const showQR = showQRForBlobId === f.blobId;
                const qrDataUrl = qrDataUrls.get(f.blobId);
                const qrSourceUrl = qrSourceUrls.get(f.blobId);

                const handleToggleQR = async (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!showQR) {
                    if (
                      shareInfo.encrypted &&
                      shareInfo.wrappedFileKey &&
                      !privateKey &&
                      !isSharedByOthers
                    ) {
                      requestReauth(async () => {
                        const fullUrl = await getFullShareUrl({
                          forceRefresh: true,
                        });
                        if (!qrDataUrl || qrSourceUrl !== fullUrl) {
                          try {
                            const qrcodeMod = await import("qrcode");
                            const toDataURL =
                              qrcodeMod.toDataURL ||
                              qrcodeMod.default?.toDataURL;
                            if (toDataURL) {
                              const dataUrl = await toDataURL(fullUrl);
                              setQrDataUrls((prev) =>
                                new Map(prev).set(f.blobId, dataUrl),
                              );
                              setQrSourceUrls((prev) =>
                                new Map(prev).set(f.blobId, fullUrl),
                              );
                            }
                          } catch (err) {
                            console.error("[handleToggleQR] Error:", err);
                          }
                        }
                        setShowQRForBlobId(f.blobId);
                      });
                      return;
                    }

                    const fullUrl = await getFullShareUrl();

                    if (!qrDataUrl || qrSourceUrl !== fullUrl) {
                      try {
                        const qrcodeMod = await import("qrcode");
                        const toDataURL =
                          qrcodeMod.toDataURL || qrcodeMod.default?.toDataURL;
                        if (toDataURL) {
                          const dataUrl = await toDataURL(fullUrl);
                          setQrDataUrls((prev) =>
                            new Map(prev).set(f.blobId, dataUrl),
                          );
                          setQrSourceUrls((prev) =>
                            new Map(prev).set(f.blobId, fullUrl),
                          );
                        }
                      } catch (err) {
                        console.error("[handleToggleQR] Error:", err);
                      }
                    }
                    setShowQRForBlobId(f.blobId);
                  } else {
                    setShowQRForBlobId(null);
                  }
                };

                const handleCopyLink = async (e: React.MouseEvent) => {
                  e.stopPropagation();

                  if (
                    shareInfo.encrypted &&
                    shareInfo.wrappedFileKey &&
                    !privateKey &&
                    !isSharedByOthers
                  ) {
                    requestReauth(async () => {
                      const fullUrl = await getFullShareUrl({
                        forceRefresh: true,
                      });
                      navigator.clipboard.writeText(fullUrl);
                      setCopiedShareLinkId(f.blobId);
                      setTimeout(() => setCopiedShareLinkId(null), 2000);
                    });
                    return;
                  }

                  const fullUrl = await getFullShareUrl();
                  navigator.clipboard.writeText(fullUrl);
                  setCopiedShareLinkId(f.blobId);
                  setTimeout(() => setCopiedShareLinkId(null), 2000);
                };

                return (
                  <>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {!isSharedByOthers ? (
                        <>
                          <button
                            onClick={handleCopyLink}
                            className="text-xs px-2 py-1 rounded bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-200 transition-colors flex items-center gap-1"
                          >
                            {copiedShareLinkId === f.blobId ? (
                              <>
                                <Check className="h-3 w-3" />
                                Copied!
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy Link
                              </>
                            )}
                          </button>
                          <button
                            onClick={handleToggleQR}
                            className="text-xs px-2 py-1 rounded bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-200 transition-colors flex items-center gap-1"
                          >
                            <QrCode className="h-3 w-3" />
                            View QR
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            title="Download"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadShared(e);
                            }}
                            className="text-xs px-2 py-1 rounded bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-200 transition-colors flex items-center gap-1"
                          >
                            {downloadingId === f.blobId ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Downloading...
                              </>
                            ) : (
                              <>
                                <Download className="h-3 w-3" />
                                Download
                              </>
                            )}
                          </button>
                          <button
                            title="Save to My Files"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveShared();
                            }}
                            className="text-xs px-2 py-1 rounded bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 hover:text-emerald-200 transition-colors flex items-center gap-1"
                          >
                            {savingSharedId === f.blobId ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Upload className="h-3 w-3" />
                                Save to My Storage
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                    {showQR &&
                      qrDataUrl &&
                      !isSharedByOthers &&
                      createPortal(
                        <div
                          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                          onClick={() => setShowQRForBlobId(null)}
                        >
                          <div
                            className="bg-zinc-900 rounded-lg p-6 border border-zinc-700 shadow-xl max-w-sm w-11/12"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="text-lg font-semibold text-white">
                                Share QR Code
                              </h3>
                              <button
                                onClick={() => setShowQRForBlobId(null)}
                                className="text-emerald-300 hover:text-emerald-200 transition-colors"
                              >
                                <X className="h-5 w-5" />
                              </button>
                            </div>
                            <div className="flex justify-center">
                              <img
                                src={qrDataUrl}
                                alt="Share QR Code"
                                className="w-64 h-64 rounded border border-zinc-700 bg-zinc-900 p-2"
                              />
                            </div>
                          </div>
                        </div>,
                        document.body,
                      )}
                  </>
                );
              })()}
          </div>

          {/* Hover quick actions + file menu button - Hide download/share in shared view */}
          {currentView !== "shared" && (
            <div className="ml-2 flex items-center gap-1 self-center">
              <div
                className={`flex items-center gap-1 transition-opacity ${
                  downloadingId === f.blobId || shareActiveId === f.blobId
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <button
                  title="Download"
                  onClick={(e) => {
                    e.stopPropagation();
                    downloadFile(f.blobId, f.name, f.encrypted);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    downloadingId === f.blobId
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "hover:bg-zinc-800 dark:hover:bg-zinc-700"
                  }`}
                >
                  {downloadingId === f.blobId ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  ) : (
                    <Download className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                <button
                  title="Share"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShareActiveId(f.blobId);
                    handleShare(f.blobId, f.name);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    shareActiveId === f.blobId
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "hover:bg-zinc-800 dark:hover:bg-zinc-700"
                  }`}
                >
                  {shareActiveId === f.blobId ? (
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                  ) : (
                    <Share2 className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                <button
                  title="Move to Folder"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFileToMove({
                      blobId: f.blobId,
                      name: f.name,
                      currentFolderId: f.folderId,
                    });
                    setMoveDialogOpen(true);
                  }}
                  className="p-2 hover:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  <FolderInput className="h-5 w-5 text-gray-400" />
                </button>
                <button
                  title={isStarred ? "Unfavorite" : "Favorite"}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleStar(f.blobId, !isStarred);
                  }}
                  className="p-2 hover:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors group"
                >
                  <Star
                    className={`h-5 w-5 transition-all ${
                      isStarred
                        ? "text-emerald-300 fill-emerald-300"
                        : "text-gray-400"
                    }`}
                  />
                </button>
              </div>

              {/* File menu button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (openMenuId === f.blobId) {
                    setOpenMenuId(null);
                    setFileMenuPosition(null);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setFileMenuPosition({
                      top: rect.bottom + 6,
                      left: Math.max(8, rect.right - 160),
                    });
                    setOpenMenuId(f.blobId);
                  }
                }}
                className="p-2 hover:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <MoreVertical className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          )}

          {/* File dropdown menu */}
          {openMenuId === f.blobId && (
            <>
              {/* Backdrop to close menu and prevent clicks behind */}
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => {
                  setOpenMenuId(null);
                  setFileMenuPosition(null);
                }}
              />
              <div
                className="fixed z-[101] bg-zinc-900 rounded-lg shadow-lg border border-zinc-800 py-1 min-w-[160px]"
                style={{
                  top: `${Math.max(8, Math.min(fileMenuPosition?.top ?? 0, window.innerHeight - 220))}px`,
                  left: `${Math.max(8, Math.min(fileMenuPosition?.left ?? 0, window.innerWidth - 180))}px`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                  onClick={() => {
                    downloadFile(f.blobId, f.name, f.encrypted);
                    setOpenMenuId(null);
                  }}
                >
                  <Download className="h-4 w-4" />
                  Download
                </button>
                {currentView !== "shared" && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                    onClick={() => {
                      handleShare(f.blobId, f.name);
                      setOpenMenuId(null);
                    }}
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                )}
                {currentView !== "shared" && (
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                    onClick={() => {
                      handleToggleStar(f.blobId, !isStarred);
                      setOpenMenuId(null);
                    }}
                  >
                    <Star
                      className={`h-4 w-4 ${
                        isStarred ? "text-white fill-white" : ""
                      }`}
                    />
                    {isStarred ? "Unfavorite" : "Favorite"}
                  </button>
                )}
                <button
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-left`}
                  onClick={() => {
                    setSelectedFile(f);
                    setExtendDialogOpen(true);
                    setOpenMenuId(null);
                  }}
                >
                  <CalendarPlus className={`h-4 w-4`} />
                  <span className={""}>Extend Duration</span>
                </button>
                <button
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-left ${
                    currentView === "recents"
                      ? "bg-emerald-900/20 border-l-2 border-emerald-500"
                      : ""
                  }`}
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
                  <FolderInput
                    className={`h-4 w-4 ${currentView === "recents" ? "text-emerald-400" : ""}`}
                  />
                  <span
                    className={
                      currentView === "recents"
                        ? "font-semibold text-emerald-300"
                        : ""
                    }
                  >
                    Move to Folder
                  </span>
                </button>

                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                  onClick={() => {
                    copyBlobId(f.blobId);
                    setOpenMenuId(null);
                  }}
                >
                  {copiedId === f.blobId ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Copy ID
                </button>

                <hr className="my-1 border-zinc-800" />
                <button
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-destructive-20 text-destructive dark:text-destructive-foreground text-left"
                  onClick={() => {
                    handleDelete(f.blobId, f.name);
                    setOpenMenuId(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const handleRenameFolder = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id || !editingFolderName.trim()) return;

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          name: editingFolderName.trim(),
        }),
      });

      if (res.ok) {
        fetchFolders();
        onFolderCreated?.(); // Notify parent to refresh
      } else {
        const data = await res.json();
        alert(data.error || "Failed to rename folder");
      }
    } catch (err) {
      console.error("Failed to rename folder:", err);
    } finally {
      setEditingFolderId(null);
      setEditingFolderName("");
    }
  };

  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleDeleteFolder = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    try {
      const res = await fetch(
        apiUrl(`/api/folders/${folderId}?userId=${user.id}`),
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        if (currentFolderId === folderId) {
          onFolderChange(null);
        }
        fetchFolders();
        onFolderDeleted?.(); // Notify parent to refresh
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete folder");
      }
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  };

  const isEmpty =
    currentLevelFolders.length === 0 && currentLevelFiles.length === 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  // Get view title
  const getViewTitle = () => {
    if (currentView === "starred") return "Favorite Files";
    if (currentView === "recents") return "Recent Uploads";
    if (currentView === "shared") return "Shared Files";
    if (currentView === "expiring") return "Expiring Soon";
    return null;
  };

  return (
    <div className="space-y-6">
      {/* View Title */}
      {getViewTitle() && (
        <div className="mb-4">
          <h2 className="text-2xl font-semibold text-white">
            {getViewTitle()}
          </h2>
          {currentView === "expiring" && (
            <p className="text-sm text-gray-300 mt-1">
              Files with 10 days or less remaining
            </p>
          )}
          {currentView === "recents" && (
            <p className="text-sm text-gray-300 mt-1">
              Your 10 most recently uploaded files
            </p>
          )}
        </div>
      )}

      {/* Breadcrumb Navigation - only show for folder views */}
      {currentView === "all" && currentFolderId !== null && (
        <div className="flex items-center gap-2 text-sm">
          {folderPath.map((item, index) => (
            <div key={item.id ?? "root"} className="flex items-center gap-2">
              {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}
              <button
                onClick={() => onFolderChange(item.id)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors ${
                  index === folderPath.length - 1
                    ? "bg-emerald-900/40 text-emerald-300 font-medium border border-emerald-700/50"
                    : "hover:bg-zinc-800 text-gray-400"
                }`}
              >
                {index === 0 && <Home className="h-4 w-4" />}
                {index > 0 && <Folder className="h-4 w-4" />}
                {item.name}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty State - Show when no folders exist at root (only in 'all' view) */}
      {currentView === "all" &&
        currentFolderId === null &&
        currentLevelFolders.length === 0 &&
        currentLevelFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full max-w-6xl">
              {/* Dotted line create folder button */}
              <button
                onClick={() => {
                  setCreateFolderParentId(null);
                  setCreateFolderDialogOpen(true);
                }}
                className="group relative rounded-xl border-2 border-dashed border-emerald-700 bg-emerald-950/20 p-8 shadow-sm transition-all hover:border-emerald-600 hover:bg-emerald-950/30 hover:shadow-md flex flex-col items-center justify-center min-h-[160px]"
              >
                <FolderPlus className="h-12 w-12 text-emerald-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-emerald-300">
                  Create New Folder
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Show create folder prompt when files exist but no folders */}
      {currentView === "all" &&
        currentFolderId === null &&
        currentLevelFolders.length === 0 &&
        currentLevelFiles.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Folders</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <button
                onClick={() => {
                  setCreateFolderParentId(null);
                  setCreateFolderDialogOpen(true);
                }}
                className="group relative rounded-xl border-2 border-dashed border-emerald-700 bg-emerald-950/20 p-8 shadow-sm transition-all hover:border-emerald-600 hover:bg-emerald-950/30 hover:shadow-md flex flex-col items-center justify-center min-h-[160px]"
              >
                <FolderPlus className="h-12 w-12 text-emerald-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-emerald-300">
                  Create New Folder
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Folders Grid - Show ONLY in 'all' view when at root or in a folder with subfolders */}
      {currentView === "all" && currentLevelFolders.length > 0 && (
        <div>
          {currentFolderId === null && (
            <h3 className="text-sm font-medium text-gray-300 mb-3">Folders</h3>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {currentLevelFolders.map((folder) => (
              <div
                key={folder.id}
                className="group relative rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-4 shadow-sm transition-all hover:border-emerald-700 hover:shadow-md cursor-pointer"
                onClick={() => {
                  if (openFolderMenuId === folder.id) {
                    setOpenFolderMenuId(null);
                    setFolderMenuPosition(null);
                    return;
                  }
                  handleFolderClick(folder.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpenFolderMenuId(folder.id);
                  setFolderMenuPosition({
                    top: e.clientY + 4,
                    left: e.clientX + 4,
                  });
                }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
                    <Folder
                      className="h-10 w-10"
                      style={{ color: folder.color || "#10b981" }}
                    />
                  </div>

                  {editingFolderId === folder.id ? (
                    <input
                      type="text"
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onBlur={() => handleRenameFolder(folder.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameFolder(folder.id);
                        if (e.key === "Escape") {
                          setEditingFolderId(null);
                          setEditingFolderName("");
                        }
                      }}
                      className="w-full bg-transparent border-b border-emerald-400 outline-none text-[15px] text-center text-gray-100"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="font-medium text-gray-100 truncate w-full text-[15px]">
                      {folder.name}
                    </p>
                  )}

                  <p className="text-xs text-gray-300 mt-1">
                    {folder.fileCount} file{folder.fileCount !== 1 ? "s" : ""}
                    {folder.childCount > 0 &&
                      `, ${folder.childCount} folder${folder.childCount !== 1 ? "s" : ""}`}
                  </p>
                </div>

                {/* Folder menu button */}
                <button
                  ref={(el) => {
                    if (el) folderButtonRefs.current.set(folder.id, el);
                    else folderButtonRefs.current.delete(folder.id);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (openFolderMenuId === folder.id) {
                      setOpenFolderMenuId(null);
                      setFolderMenuPosition(null);
                    } else {
                      const button = folderButtonRefs.current.get(folder.id);
                      if (button) {
                        const rect = button.getBoundingClientRect();
                        const menuWidth = 140;
                        setFolderMenuPosition({
                          top: rect.bottom + 4,
                          left: Math.max(8, rect.right - menuWidth),
                        });
                      }
                      setOpenFolderMenuId(folder.id);
                    }
                  }}
                  className="absolute top-2 right-2 p-1.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 rounded-lg transition-all z-10"
                >
                  <MoreVertical className="h-4 w-4 text-gray-400" />
                </button>

                {/* Folder dropdown menu - rendered via portal to avoid z-index issues */}
                {openFolderMenuId === folder.id &&
                  folderMenuPosition &&
                  typeof window !== "undefined" &&
                  createPortal(
                    <>
                      {/* Backdrop to close menu */}
                      <div
                        className="fixed inset-0 z-[9998]"
                        onClick={() => {
                          setOpenFolderMenuId(null);
                          setFolderMenuPosition(null);
                        }}
                      />
                      <div
                        className="fixed z-[9999] bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 py-2 px-0 min-w-[140px]"
                        style={{
                          top: `${folderMenuPosition.top}px`,
                          left: `${Math.max(8, Math.min(folderMenuPosition.left, window.innerWidth - 150))}px`,
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                          onClick={() => {
                            setEditingFolderId(folder.id);
                            setEditingFolderName(folder.name);
                            setOpenFolderMenuId(null);
                            setFolderMenuPosition(null);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                          Rename
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                          onClick={() => {
                            setCreateFolderParentId(folder.id);
                            setCreateFolderDialogOpen(true);
                            setOpenFolderMenuId(null);
                            setFolderMenuPosition(null);
                          }}
                        >
                          <FolderPlus className="h-4 w-4" />
                          New Subfolder
                        </button>
                        <hr className="my-1 border-zinc-800" />
                        <button
                          className="w-full flex items-center gap-2 px-2 py-2 text-sm hover:bg-destructive-20 text-destructive text-left"
                          onClick={() => {
                            setFolderToDelete({
                              id: folder.id,
                              name: folder.name,
                            });
                            setFolderDeleteOpen(true);
                            setOpenFolderMenuId(null);
                            setFolderMenuPosition(null);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </>,
                    document.body,
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State for folder with no files (only in 'all' view) */}
      {currentView === "all" &&
        currentFolderId !== null &&
        currentLevelFiles.length === 0 &&
        currentLevelFolders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
              <FolderOpen className="h-12 w-12 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              This folder is empty
            </h3>
            <p className="text-gray-300 mb-6 max-w-md">
              Add files or create subfolders to organize your content.
            </p>
          </div>
        )}
      {currentView === "starred" && loadingStarred && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      )}
      {/* Empty State for special views */}
      {currentView !== "all" &&
        !loadingStarred &&
        currentLevelFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
              {currentView === "recents" && (
                <Clock className="h-12 w-12 text-emerald-400" />
              )}
              {currentView === "shared" && (
                <Share2 className="h-12 w-12 text-emerald-400" />
              )}
              {currentView === "expiring" && (
                <AlertCircle className="h-12 w-12 text-orange-600 dark:text-orange-400" />
              )}
              {currentView === "starred" && (
                <Star className="h-12 w-12 text-emerald-400" />
              )}
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {currentView === "recents" && "No recently uploaded files"}
              {currentView === "shared" && "No shared files"}
              {currentView === "expiring" && "No files expiring soon"}
              {currentView === "starred" && "No favorite files yet"}
            </h3>
            <p className="text-gray-300 max-w-md">
              {currentView === "recents" &&
                "Upload some files to see them here."}
              {currentView === "shared" &&
                "Share a file to see it here with its share link and expiry information."}
              {currentView === "expiring" &&
                "All your files have more than 10 days remaining."}
              {currentView === "starred" &&
                "Mark your favorite files to find them here quickly"}
            </p>
          </div>
        )}

      {/* Files Display - Vertical list for consistency across all views */}
      {currentLevelFiles.length > 0 && (
        <div className="w-full">
          {currentView === "all" && (
            <h3 className="text-sm font-medium text-gray-300 mb-3">Files</h3>
          )}

          {currentView === "shared" ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-emerald-300 mb-3">
                  Shared by you
                </h3>
                {sharedByYouFiles.length > 0 ? (
                  <div className="flex flex-col space-y-3 w-full">
                    {sharedByYouFiles.map(renderFileRow)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    No files shared by you yet.
                  </p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-emerald-300 mb-3">
                  Shared by others
                </h3>
                {sharedByOthersFiles.length > 0 ? (
                  <div className="flex flex-col space-y-3 w-full">
                    {sharedByOthersFiles.map(renderFileRow)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    No files shared with you yet.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col space-y-3 w-full">
              {currentLevelFiles.map(renderFileRow)}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentId={createFolderParentId}
        onFolderCreated={() => {
          fetchFolders();
          onFolderCreated?.();
        }}
      />

      {shareFile && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setShareFile(null);
          }}
          blobId={shareFile.blobId}
          filename={shareFile.filename}
          wrappedFileKey={shareFile.wrappedFileKey}
          uploadedAt={shareFile.uploadedAt}
          epochs={shareFile.epochs}
          onShareCreated={() => {
            onSharedFilesRefresh?.();
          }}
        />
      )}

      {selectedFile && (
        <ExtendDurationDialog
          open={extendDialogOpen}
          onOpenChange={setExtendDialogOpen}
          blobId={selectedFile.blobId}
          fileName={selectedFile.name}
          fileSize={selectedFile.size}
          currentEpochs={selectedFile.epochs}
          onSuccess={() => onFileDeleted?.()}
        />
      )}

      {fileToDelete && (
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
      )}

      {folderToDelete && (
        <DeleteConfirmDialog
          open={folderDeleteOpen}
          onOpenChange={(open) => {
            setFolderDeleteOpen(open);
            if (!open) setFolderToDelete(null);
          }}
          fileName={folderToDelete.name}
          title={"Delete folder?"}
          description={
            "This will permanently delete the folder. Files inside will be moved to the root."
          }
          note={"You can move files before deleting if needed."}
          onConfirm={() => {
            if (!folderToDelete) return;
            handleDeleteFolder(folderToDelete.id);
            setFolderToDelete(null);
          }}
        />
      )}

      {fileToMove && (
        <MoveFileDialog
          open={moveDialogOpen}
          onClose={() => {
            setMoveDialogOpen(false);
            setFileToMove(null);
          }}
          files={[fileToMove]}
          onCreateFolder={(parentId) => {
            setCreateFolderParentId(parentId);
            setCreateFolderDialogOpen(true);
          }}
          onFileMoved={() => {
            onFileMoved?.();
            onFileDeleted?.();
          }}
        />
      )}

      {/* Loading overlay during file upload after payment */}
      {isUploadingAfterPayment && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-emerald-400" />
            <p className="text-white text-lg font-medium">
              Uploading your file...
            </p>
          </div>
        </div>
      )}

      {/* Error notifications */}
      {fileForPayment && (
        <PaymentApprovalDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          file={fileForPayment}
          onApprove={async (costUSD, epochs) => {
            setPaymentDialogOpen(false);
            setIsUploadingAfterPayment(true);
            // Proceed with upload after payment approved
            if (pendingFileUpload) {
              try {
                const user = authService.getCurrentUser();
                if (!user?.id) {
                  setShareError("You must be logged in to save files");
                  setTimeout(() => setShareError(null), 5000);
                  setIsUploadingAfterPayment(false);
                  return;
                }

                const fileToUpload = new File(
                  [pendingFileUpload.fileBlob],
                  pendingFileUpload.fileName,
                  { type: pendingFileUpload.contentType },
                );

                const encryptionResult = await encryptWithPerFileKey(
                  fileToUpload,
                  privateKey || "",
                );

                const uploadMode = "async" as const;
                const resp = await uploadBlob(
                  encryptionResult.encryptedBlob,
                  privateKey || "",
                  undefined,
                  undefined,
                  user.id,
                  fileToUpload.name,
                  undefined,
                  true,
                  epochs,
                  uploadMode,
                  encryptionResult.wrappedFileKey,
                );

                if (!resp.blobId) {
                  throw new Error(
                    "Upload succeeded but no blobId was returned.",
                  );
                }

                // Clear pending upload and redirect to storage
                setPendingFileUpload(null);
                setFileForPayment(null);
                onFileDeleted?.();

                // Redirect to storage page
                navigate("/?view=all");
              } catch (err: any) {
                console.error("[Payment upload] Error:", err);
                setShareError("Failed to save file");
                setTimeout(() => setShareError(null), 5000);
                setPendingFileUpload(null);
                setFileForPayment(null);
                setIsUploadingAfterPayment(false);
              }
            }
          }}
          onCancel={() => {
            setPaymentDialogOpen(false);
            setPendingFileUpload(null);
            setFileForPayment(null);
          }}
        />
      )}

      {/* Error notifications */}
      {downloadError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20 animate-fade-in z-50">
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

      {shareError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-orange-200 bg-orange-50 p-4 shadow-lg dark:border-orange-900 dark:bg-orange-900/20 animate-fade-in z-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                Share Not Available
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                {shareError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Note: Click outside handlers are now handled by individual menu backdrops */}
    </div>
  );
}
