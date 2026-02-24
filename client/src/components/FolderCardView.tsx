import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
import { useDaysPerEpoch } from "../hooks/useDaysPerEpoch";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import "./css/FolderCardView.css";
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
  encryptFile,
  decryptFile,
  decryptWithSharedKey,
  exportFileKeyForShare,
} from "../services/crypto";
import { useAutoScroll } from "../hooks/useAutoScroll";
import {
  StatusBadgeTooltip,
  STATUS_BADGE_TOOLTIPS,
} from "./StatusBadgeTooltip";

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
  id?: string;
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
  starred?: boolean;
};

interface FolderCardViewProps {
  files: FileItem[];
  folders: FolderNode[];
  currentFolderId: string | null;
  onFolderChange: (folderId: string | null) => void;
  onFileDeleted?: (blobId?: string) => void;
  onFileMoved?: () => void;
  onFileMovedOptimistic?: (
    blobIds: string[],
    newFolderId: string | null,
  ) => void;
  onFolderDeleted?: () => void;
  onFolderDeletedOptimistic?: (folderId: string) => void;
  onFolderCreated?: (folder?: {
    id: string;
    name: string;
    parentId: string | null;
    color: string | null;
  }) => void;
  onFolderMovedOptimistic?: (
    folderIdToMove: string,
    newParentId: string | null,
  ) => void;
  onUploadClick: () => void;
  currentView?:
    | "all"
    | "recents"
    | "shared"
    | "expiring"
    | "favorites"
    | "upload-queue";
  sharedFiles?: any[];
  onSharedFilesRefresh?: () => void;
  folderRefreshKey?: number;
  onStarToggle?: (blobId: string, starred: boolean) => void;
  onCheckBalanceForSharedUpload?: (context: {
    blobId: string;
    shareId?: string | null;
  }) => Promise<boolean>;
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
  folders: propFolders,
  currentFolderId,
  onFolderChange,
  onFileDeleted,
  onFileMoved,
  onFileMovedOptimistic,
  onFolderDeleted,
  onFolderDeletedOptimistic,
  onFolderCreated,
  onFolderMovedOptimistic,
  onUploadClick,
  currentView = "all",
  sharedFiles = [],
  onSharedFilesRefresh,
  folderRefreshKey: _folderRefreshKey,
  onStarToggle,
  onCheckBalanceForSharedUpload,
}: FolderCardViewProps) {
  const { privateKey, requestReauth } = useAuth();
  const navigate = useNavigate();
  const [scrollContainer, setScrollContainer] = useState<HTMLElement | null>(
    null,
  );
  const { startAutoScroll, stopAutoScroll } = useAutoScroll({
    enabled: true,
    edgeDistance: 100,
    scrollSpeed: 16,
    scrollableElement: scrollContainer,
  });
  const [savedSharedFiles, setSavedSharedFiles] = useState<any[]>([]);
  const [loadingSavedShares, setLoadingSavedShares] = useState(false);
  const folders = propFolders; // Use folders from props instead of local state
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
  const [revokingShareId, setRevokingShareId] = useState<string | null>(null);
  const [unshareDialogOpen, setUnshareDialogOpen] = useState(false);
  const [shareToUnshare, setShareToUnshare] = useState<{
    shareId: string;
    blobId: string;
    filename: string;
  } | null>(null);
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
  const fileStatusMapRef = useRef(fileStatusMap);
  const fileBlobIdMapRef = useRef(fileBlobIdMap);
  const [starredMap, setStarredMap] = useState<Map<string, boolean>>(new Map());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [fileMenuPosition, setFileMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [fileMenuAnchorRect, setFileMenuAnchorRect] = useState<DOMRect | null>(
    null,
  );
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null);
  const [folderMenuPosition, setFolderMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const folderButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const ignoreBackdropClickRef = useRef(false);

  const getEffectiveStatus = useCallback(
    (file: FileItem) => fileStatusMap.get(file.blobId) ?? file.status,
    [fileStatusMap],
  );

  useEffect(() => {
    fileStatusMapRef.current = fileStatusMap;
  }, [fileStatusMap]);

  useEffect(() => {
    fileBlobIdMapRef.current = fileBlobIdMap;
  }, [fileBlobIdMap]);

  const resolveBlobId = useCallback(
    (blobId: string) => fileBlobIdMapRef.current.get(blobId) ?? blobId,
    [],
  );

  useLayoutEffect(() => {
    if (!openMenuId || !fileMenuAnchorRect || !fileMenuRef.current) return;
    const menuRect = fileMenuRef.current.getBoundingClientRect();
    const margin = 8;
    let top = fileMenuAnchorRect.bottom + 6;

    if (top + menuRect.height > window.innerHeight - margin) {
      top = fileMenuAnchorRect.top - menuRect.height - 6;
    }

    top = Math.max(
      margin,
      Math.min(top, window.innerHeight - menuRect.height - margin),
    );

    let left = fileMenuAnchorRect.right - menuRect.width;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - menuRect.width - margin),
    );

    setFileMenuPosition((prev) => {
      if (prev && prev.top === top && prev.left === left) return prev;
      return { top, left };
    });
  }, [openMenuId, fileMenuAnchorRect]);

  // Dialogs
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{
    blobId: string;
    name: string;
  } | null>(null);
  const [locallyDeletedBlobIds, setLocallyDeletedBlobIds] = useState<
    Set<string>
  >(new Set());
  const [locallyMovedBlobIds, setLocallyMovedBlobIds] = useState<Set<string>>(
    new Set(),
  );
  const [locallyMovedFolderIds, setLocallyMovedFolderIds] = useState<
    Set<string>
  >(new Set());
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [dragMoveError, setDragMoveError] = useState<string | null>(null);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareFile, setShareFile] = useState<{
    blobId: string;
    filename: string;
    encrypted: boolean;
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
    id?: string;
    blobId: string;
    name: string;
    currentFolderId?: string | null;
  } | null>(null);
  const moveDialogFiles = useMemo(
    () => (fileToMove ? [fileToMove] : []),
    [fileToMove],
  );
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null
  >(null);
  const [draggedFile, setDraggedFile] = useState<FileItem | null>(null);
  const [draggedFolder, setDraggedFolder] = useState<FolderNode | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [dragOverFileId, setDragOverFileId] = useState<string | null>(null);
  const [dragOverBreadcrumbId, setDragOverBreadcrumbId] = useState<
    string | null
  >(null);
  const [isDragMoving, setIsDragMoving] = useState(false);
  const [contentMenuPosition, setContentMenuPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const contentMenuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!contentMenuPosition || !contentMenuRef.current) return;
    const menuRect = contentMenuRef.current.getBoundingClientRect();
    const margin = 8;
    let top = contentMenuPosition.top;
    let left = contentMenuPosition.left;

    if (top + menuRect.height > window.innerHeight - margin) {
      top = window.innerHeight - menuRect.height - margin;
    }

    if (left + menuRect.width > window.innerWidth - margin) {
      left = window.innerWidth - menuRect.width - margin;
    }

    top = Math.max(margin, top);
    left = Math.max(margin, left);

    setContentMenuPosition((prev) => {
      if (prev && prev.top === top && prev.left === left) return prev;
      return { top, left };
    });
  }, [contentMenuPosition]);

  // Multi-select state
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(
    new Set(),
  );
  const lastSelectedFileIdRef = useRef<string | null>(null);
  const lastSelectedFolderIdRef = useRef<string | null>(null);

  // Drag-to-select state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const selectionContainerRef = useRef<HTMLDivElement | null>(null);
  const fileCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const folderCardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const isDraggingSelectionRef = useRef(false);
  const lastSelectionPointRef = useRef<{ x: number; y: number } | null>(null);
  const selectionStartContentRef = useRef<{ x: number; y: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const container = selectionContainerRef.current;
    if (!container) return;

    const findScrollableAncestor = (node: HTMLElement | null) => {
      let current: HTMLElement | null = node;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const overflowY = style.overflowY;
        const overflowX = style.overflowX;
        const hasScrollableOverflowY =
          overflowY === "auto" ||
          overflowY === "scroll" ||
          overflowY === "overlay";
        const hasScrollableOverflowX =
          overflowX === "auto" ||
          overflowX === "scroll" ||
          overflowX === "overlay";

        if (hasScrollableOverflowY || hasScrollableOverflowX) {
          return current;
        }

        current = current.parentElement;
      }

      return null;
    };

    const found = findScrollableAncestor(container);
    const fallback =
      typeof document !== "undefined" ? document.scrollingElement : null;
    setScrollContainer(
      found ?? (fallback instanceof HTMLElement ? fallback : null),
    );
  }, []);

  const getScrollMetrics = useCallback(() => {
    if (scrollContainer) {
      const rect = scrollContainer.getBoundingClientRect();
      return {
        rect,
        scrollLeft: scrollContainer.scrollLeft,
        scrollTop: scrollContainer.scrollTop,
      };
    }

    return {
      rect: { top: 0, left: 0 } as DOMRect,
      scrollLeft: window.scrollX,
      scrollTop: window.scrollY,
    };
  }, [scrollContainer]);

  const toContentPoint = useCallback(
    (clientX: number, clientY: number) => {
      const { rect, scrollLeft, scrollTop } = getScrollMetrics();
      return {
        x: clientX - rect.left + scrollLeft,
        y: clientY - rect.top + scrollTop,
      };
    },
    [getScrollMetrics],
  );

  const toClientPoint = useCallback(
    (contentX: number, contentY: number) => {
      const { rect, scrollLeft, scrollTop } = getScrollMetrics();
      return {
        x: contentX - scrollLeft + rect.left,
        y: contentY - scrollTop + rect.top,
      };
    },
    [getScrollMetrics],
  );

  // Clear selection when navigating to a different folder
  useEffect(() => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
    lastSelectedFileIdRef.current = null;
    lastSelectedFolderIdRef.current = null;
  }, [currentFolderId]);

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

  // Clear locally moved IDs after files refresh from server
  useEffect(() => {
    if (locallyMovedBlobIds.size > 0) {
      setLocallyMovedBlobIds((prev) => {
        const next = new Set(prev);
        const currentBlobIds = new Set(files.map((f) => f.blobId));
        // Only keep IDs that still exist in the current file list
        prev.forEach((id) => {
          if (!currentBlobIds.has(id)) {
            next.delete(id);
          }
        });
        return next;
      });
    }
  }, [files, locallyMovedBlobIds]);

  // Clear locally moved folder IDs after folders refresh from server
  useEffect(() => {
    if (locallyMovedFolderIds.size > 0) {
      setLocallyMovedFolderIds((prev) => {
        const next = new Set(prev);
        // Get all current folder IDs recursively
        const getAllFolderIds = (folderList: FolderNode[]): Set<string> => {
          const ids = new Set<string>();
          const traverse = (folder: FolderNode) => {
            ids.add(folder.id);
            folder.children.forEach(traverse);
          };
          folderList.forEach(traverse);
          return ids;
        };
        const currentFolderIds = getAllFolderIds(folders);
        // Only keep IDs that still exist in the current folder tree
        prev.forEach((id) => {
          if (!currentFolderIds.has(id)) {
            next.delete(id);
          }
        });
        return next;
      });
    }
  }, [folders, locallyMovedFolderIds]);

  useEffect(() => {
    if (currentView !== "all") {
      setDraggedFile(null);
      setDragOverFolderId(null);
      setDragOverFileId(null);
      setDragOverBreadcrumbId(null);
      stopAutoScroll();
    }
  }, [currentView, stopAutoScroll]);

  // Add global dragend listener to ensure auto-scroll stops
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      stopAutoScroll();
    };

    document.addEventListener("dragend", handleGlobalDragEnd, true);
    return () => {
      document.removeEventListener("dragend", handleGlobalDragEnd, true);
    };
  }, [stopAutoScroll]);

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

    if (currentView === "shared" && effectiveSharedFiles.length > 0) {
      effectiveSharedFiles.forEach(async (shareInfo) => {
        if (shareInfo.encrypted && !fullShareUrls.has(shareInfo.blobId)) {
          const storedKey = (() => {
            try {
              return (
                localStorage.getItem(`walrus_share_key:${shareInfo.shareId}`) ||
                sessionStorage.getItem(
                  `walrus_share_key:${shareInfo.shareId}`,
                ) ||
                ""
              );
            } catch {
              return "";
            }
          })();

          // First, try to use the stored share key
          if (storedKey) {
            const fullUrl = `${window.location.origin}/s/${shareInfo.shareId}#k=${storedKey}`;
            setFullShareUrls((prev) =>
              new Map(prev).set(shareInfo.blobId, fullUrl),
            );
            return;
          }

          // Fallback: If no stored key and we have private key, try to derive it
          if (privateKey) {
            try {
              const user = authService.getCurrentUser();
              const blobRes = await downloadBlob(
                shareInfo.blobId,
                "",
                undefined,
                user?.id,
              );
              if (!blobRes.ok) throw new Error("Failed to download blob");
              const blobData = await blobRes.blob();
              const fileKeyBase64url = await exportFileKeyForShare(
                blobData,
                privateKey,
              );
              const fullUrl = `${window.location.origin}/s/${shareInfo.shareId}#k=${fileKeyBase64url}`;

              // Store the derived key for future use
              try {
                localStorage.setItem(
                  `walrus_share_key:${shareInfo.shareId}`,
                  fileKeyBase64url,
                );
                sessionStorage.setItem(
                  `walrus_share_key:${shareInfo.shareId}`,
                  fileKeyBase64url,
                );
              } catch (storageErr) {
                console.warn(
                  "[useEffect] Failed to store share key:",
                  storageErr,
                );
              }

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
          } else {
            // No stored key and no private key available
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

  // Helper function to recursively find a folder by ID
  const findFolderById = useCallback(
    (folderList: FolderNode[], id: string): FolderNode | null => {
      for (const folder of folderList) {
        if (folder.id === id) return folder;
        const found = findFolderById(folder.children, id);
        if (found) return found;
      }
      return null;
    },
    [],
  );

  // Get folders at current level (only show in 'all' view)
  const currentLevelFolders = useMemo(
    () =>
      currentView === "all"
        ? currentFolderId === null
          ? folders
              .filter((f) => f.parentId === null)
              .filter((f) => !locallyMovedFolderIds.has(f.id))
          : (() => {
              // Find the folder with matching ID and return its direct children
              const targetFolder = findFolderById(folders, currentFolderId);
              if (!targetFolder) {
                console.warn(
                  "[FolderCardView] Could not find folder with ID:",
                  currentFolderId,
                  "in folders:",
                  folders,
                );
              }
              const result = targetFolder
                ? targetFolder.children.filter(
                    (f) => !locallyMovedFolderIds.has(f.id),
                  )
                : [];
              return result;
            })()
        : [], // Hide folders in special views
    [
      currentView,
      currentFolderId,
      folders,
      locallyMovedFolderIds,
      findFolderById,
    ],
  );

  const combinedSharedFiles =
    currentView === "shared"
      ? [...sharedFiles, ...savedSharedFiles]
      : sharedFiles;
  const seenSharedBlobIds = new Set<string>();
  const effectiveSharedFiles = combinedSharedFiles.filter((share) => {
    const blobId = share?.blobId as string | undefined;
    if (!blobId || seenSharedBlobIds.has(blobId)) return false;

    // Filter out expired shares
    if (share?.expiresAt) {
      const expiryDate = new Date(share.expiresAt);
      const now = new Date();
      if (expiryDate <= now) return false;
    }

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
          status: "completed" as const,
        }))
      : [];

  const sharedFileItemMap = useMemo(() => {
    return new Map(derivedSharedFileItems.map((file) => [file.blobId, file]));
  }, [derivedSharedFileItems]);

  const sharedFileInfoMap = useMemo(() => {
    return new Map(
      derivedSharedFiles.map((share: any) => [share.blobId, share]),
    );
  }, [derivedSharedFiles]);

  const getStoredShareKey = useCallback((shareId?: string | null) => {
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
  }, []);

  const handleSaveSharedFile = useCallback(
    async (file: FileItem, shareInfo: any, skipReauthCheck = false) => {
      if (!shareInfo) return;

      if (!skipReauthCheck && (!privateKey || privateKey.trim() === "")) {
        requestReauth(() => handleSaveSharedFile(file, shareInfo, true));
        return;
      }

      if (onCheckBalanceForSharedUpload) {
        const hasBalance = await onCheckBalanceForSharedUpload({
          blobId: shareInfo.blobId,
          shareId: shareInfo.shareId,
        });
        if (!hasBalance) {
          return;
        }
      }

      setSavingSharedId(file.blobId);
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
            filename: shareInfo.filename || file.name,
            shareId: shareInfo.shareId,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Download failed");
        }

        const blob = await response.blob();
        let fileBlob = blob;
        let fileName = shareInfo.filename || file.name;

        if (shareInfo.encrypted) {
          const decryptResult = await decryptWithSharedKey(
            blob,
            shareKey,
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
    },
    [
      getStoredShareKey,
      onCheckBalanceForSharedUpload,
      privateKey,
      requestReauth,
    ],
  );

  const confirmUnshare = useCallback(async () => {
    if (!shareToUnshare) return;

    const user = authService.getCurrentUser();
    if (!user?.id) {
      setShareError("You must be logged in to unshare files");
      setTimeout(() => setShareError(null), 5000);
      return;
    }

    setRevokingShareId(shareToUnshare.shareId);
    try {
      const response = await fetch(
        apiUrl(`/api/shares/${shareToUnshare.shareId}`),
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          throw new Error(data.error || "Failed to unshare");
        } catch (parseErr) {
          throw new Error(
            text
              ? `Failed to unshare: ${text.substring(0, 200)}`
              : "Failed to unshare",
          );
        }
      }

      setSavedSharedFiles((prev) =>
        prev.filter((share) => share.shareId !== shareToUnshare.shareId),
      );
      setFullShareUrls((prev) => {
        const next = new Map(prev);
        next.delete(shareToUnshare.blobId);
        return next;
      });
      setQrDataUrls((prev) => {
        const next = new Map(prev);
        next.delete(shareToUnshare.blobId);
        return next;
      });
      setQrSourceUrls((prev) => {
        const next = new Map(prev);
        next.delete(shareToUnshare.blobId);
        return next;
      });
      if (showQRForBlobId === shareToUnshare.blobId) {
        setShowQRForBlobId(null);
      }
      onSharedFilesRefresh?.();
    } catch (err: any) {
      console.error("[confirmUnshare] Error:", err);
      setShareError(err?.message || "Failed to unshare");
      setTimeout(() => setShareError(null), 5000);
    } finally {
      setRevokingShareId(null);
    }
  }, [shareToUnshare, showQRForBlobId, onSharedFilesRefresh]);

  useEffect(() => {
    if (currentView !== "shared") return;

    const pendingRaw = sessionStorage.getItem("pendingSharedSave");
    if (!pendingRaw) return;

    try {
      const pending = JSON.parse(pendingRaw);
      const pendingBlobId = pending?.blobId as string | undefined;
      if (!pendingBlobId) return;

      const file = sharedFileItemMap.get(pendingBlobId);
      const shareInfo = sharedFileInfoMap.get(pendingBlobId);
      if (!file || !shareInfo) return;

      sessionStorage.removeItem("pendingSharedSave");
      handleSaveSharedFile(file, shareInfo);
    } catch {
      sessionStorage.removeItem("pendingSharedSave");
    }
  }, [currentView, handleSaveSharedFile, sharedFileInfoMap, sharedFileItemMap]);

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

  const effectiveFiles = useMemo(() => {
    const baseFiles = currentView === "shared" ? derivedSharedFileItems : files;
    // Filter out locally deleted and moved files for instant UI feedback
    return baseFiles.filter(
      (f) =>
        !locallyDeletedBlobIds.has(f.blobId) &&
        !locallyMovedBlobIds.has(f.blobId),
    );
  }, [
    currentView,
    derivedSharedFileItems,
    files,
    locallyDeletedBlobIds,
    locallyMovedBlobIds,
  ]);

  const fileCountByFolderId = useMemo(() => {
    const map = new Map<string, number>();
    files
      .filter(
        (file) =>
          !locallyDeletedBlobIds.has(file.blobId) &&
          !locallyMovedBlobIds.has(file.blobId),
      )
      .forEach((file) => {
        if (!file.folderId) return;
        map.set(file.folderId, (map.get(file.folderId) ?? 0) + 1);
      });
    return map;
  }, [files, locallyDeletedBlobIds, locallyMovedBlobIds]);

  const folderAnimationKey = useMemo(() => {
    const ids = currentLevelFolders.map((folder) => folder.id).join(",");
    return `${currentFolderId ?? "root"}:${ids}`;
  }, [currentFolderId, currentLevelFolders]);

  const lastAnimatedFolderKeyRef = useRef<string | null>(null);
  const shouldAnimateFolders = useMemo(() => {
    return lastAnimatedFolderKeyRef.current !== folderAnimationKey;
  }, [folderAnimationKey]);

  useEffect(() => {
    lastAnimatedFolderKeyRef.current = folderAnimationKey;
  }, [folderAnimationKey]);

  // Get files at current level
  const currentLevelFiles =
    currentView === "all"
      ? effectiveFiles.filter((f) => f.folderId === currentFolderId)
      : effectiveFiles; // In special views, show all filtered files (filtering done in App.tsx)

  const moveFilesToFolder = useCallback(
    async (
      blobIds: string[],
      folderId: string | null,
      sourceFolderId?: string | null,
    ) => {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        setDragMoveError("You must be logged in to move files");
        setTimeout(() => setDragMoveError(null), 5000);
        return false;
      }

      const resolvedBlobIds = Array.from(
        new Set(blobIds.map((id) => resolveBlobId(id))),
      );
      const uiBlobIds = Array.from(new Set([...blobIds, ...resolvedBlobIds]));

      const fileIdByBlobId = new Map<string, string>();
      files.forEach((file) => {
        if (file.id) {
          fileIdByBlobId.set(file.blobId, file.id);
        }
      });

      const fileIds: string[] = [];
      const fallbackBlobIds: string[] = [];
      resolvedBlobIds.forEach((id) => {
        const fileId = fileIdByBlobId.get(id);
        if (fileId) {
          fileIds.push(fileId);
        } else {
          fallbackBlobIds.push(id);
        }
      });

      if (fileIds.length === 0 && fallbackBlobIds.length === 0) {
        setDragMoveError("No files selected to move");
        setTimeout(() => setDragMoveError(null), 5000);
        return false;
      }

      setIsDragMoving(true);
      setDragMoveError(null);

      // Optimistically hide moved files from current view immediately
      setLocallyMovedBlobIds((prev) => {
        const next = new Set(prev);
        uiBlobIds.forEach((id) => next.add(id));
        return next;
      });

      try {
        const res = await fetch(apiUrl("/api/files/move"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            fileIds,
            blobIds: fallbackBlobIds,
            folderId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to move files");
        }

        // Use optimistic update if available, otherwise fall back to full refresh
        if (onFileMovedOptimistic) {
          onFileMovedOptimistic(uiBlobIds, folderId);
          // Clear local move filter so files can render in the destination folder
          setLocallyMovedBlobIds((prev) => {
            const next = new Set(prev);
            uiBlobIds.forEach((id) => next.delete(id));
            return next;
          });
        } else {
          onFileMoved?.();
        }

        return true;
      } catch (err) {
        console.error("Failed to move files:", err);
        setDragMoveError("Failed to move files");
        setTimeout(() => setDragMoveError(null), 5000);

        // Restore files to view on error
        setLocallyMovedBlobIds((prev) => {
          const next = new Set(prev);
          uiBlobIds.forEach((id) => next.delete(id));
          return next;
        });

        return false;
      } finally {
        setIsDragMoving(false);
      }
    },
    [files, onFileMoved, onFileMovedOptimistic, resolveBlobId],
  );

  const moveFolderToFolder = useCallback(
    async (
      folderToMoveId: string,
      targetFolderId: string | null,
      sourceFolderId: string | null,
    ) => {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        setDragMoveError("You must be logged in to move folders");
        setTimeout(() => setDragMoveError(null), 5000);
        return false;
      }

      // Prevent moving folder into itself or same location
      if (
        folderToMoveId === targetFolderId ||
        sourceFolderId === targetFolderId
      ) {
        return false;
      }

      setIsDragMoving(true);
      setDragMoveError(null);

      // Optimistically hide moved folder from current view immediately
      setLocallyMovedFolderIds((prev) => new Set(prev).add(folderToMoveId));

      try {
        const res = await fetch(apiUrl(`/api/folders/${folderToMoveId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            parentId: targetFolderId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          // Extract and show the specific error message from server
          const errorMessage = data.error || "Failed to move folder";
          throw new Error(errorMessage);
        }

        // Use optimistic update if available, otherwise fall back to full refresh
        if (onFolderMovedOptimistic) {
          onFolderMovedOptimistic(folderToMoveId, targetFolderId);
          // Clear local move filter so folder can render in the destination
          setLocallyMovedFolderIds((prev) => {
            const next = new Set(prev);
            next.delete(folderToMoveId);
            return next;
          });
        } else {
          // Fall back to full refresh
          onFolderCreated?.();
        }

        return true;
      } catch (err) {
        console.error("Failed to move folder:", err);
        // Show the specific error message to the user
        const errorMessage =
          err instanceof Error ? err.message : "Failed to move folder";
        setDragMoveError(errorMessage);
        setTimeout(() => setDragMoveError(null), 5000);

        // Restore folder to view on error
        setLocallyMovedFolderIds((prev) => {
          const next = new Set(prev);
          next.delete(folderToMoveId);
          return next;
        });

        return false;
      } finally {
        setIsDragMoving(false);
      }
    },
    [onFolderCreated, onFolderMovedOptimistic],
  );

  // Multi-select handlers
  const handleFileClick = (fileId: string, e: React.MouseEvent) => {
    if (currentView !== "all") return;

    // Ignore clicks that were part of a drag selection
    if (isDraggingSelectionRef.current) return;

    e.stopPropagation();

    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        if (next.has(fileId)) {
          next.delete(fileId);
        } else {
          next.add(fileId);
        }
        lastSelectedFileIdRef.current = fileId;
        return next;
      });
    } else if (e.shiftKey && lastSelectedFileIdRef.current) {
      // Shift+click: select range
      const currentFiles = files.filter(
        (f) =>
          !locallyMovedBlobIds.has(f.blobId) && f.folderId === currentFolderId,
      );
      const lastIndex = currentFiles.findIndex(
        (f) => f.blobId === lastSelectedFileIdRef.current,
      );
      const currentIndex = currentFiles.findIndex((f) => f.blobId === fileId);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        setSelectedFileIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            next.add(currentFiles[i].blobId);
          }
          return next;
        });
      }
    } else {
      // Regular click: single selection
      setSelectedFileIds(new Set([fileId]));
      setSelectedFolderIds(new Set());
      lastSelectedFileIdRef.current = fileId;
    }
  };

  const handleFolderClick = (folderId: string, e: React.MouseEvent) => {
    if (currentView !== "all") return;

    // Ignore clicks that were part of a drag selection
    if (isDraggingSelectionRef.current) return;

    e.stopPropagation();

    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      setSelectedFolderIds((prev) => {
        const next = new Set(prev);
        if (next.has(folderId)) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        lastSelectedFolderIdRef.current = folderId;
        return next;
      });
    } else if (e.shiftKey && lastSelectedFolderIdRef.current) {
      // Shift+click: select range
      const getVisibleFolders = (folderList: FolderNode[]): FolderNode[] => {
        return folderList.filter(
          (f) =>
            !locallyMovedFolderIds.has(f.id) && f.parentId === currentFolderId,
        );
      };

      const visibleFolders = getVisibleFolders(folders);
      const lastIndex = visibleFolders.findIndex(
        (f) => f.id === lastSelectedFolderIdRef.current,
      );
      const currentIndex = visibleFolders.findIndex((f) => f.id === folderId);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        setSelectedFolderIds((prev) => {
          const next = new Set(prev);
          for (let i = start; i <= end; i++) {
            next.add(visibleFolders[i].id);
          }
          return next;
        });
      }
    } else {
      // Regular click: open folder
      setSelectedFolderIds(new Set([folderId]));
      setSelectedFileIds(new Set());
      lastSelectedFolderIdRef.current = folderId;
      onFolderChange(folderId);
    }
  };

  const clearSelection = () => {
    setSelectedFileIds(new Set());
    setSelectedFolderIds(new Set());
    lastSelectedFileIdRef.current = null;
    lastSelectedFolderIdRef.current = null;
  };

  useEffect(() => {
    if (currentView !== "all") return;
    if (!currentFolderId) return;

    const folderExists = findFolderById(folders, currentFolderId);
    if (!folderExists) {
      clearSelection();
      onFolderChange(null);
    }
  }, [currentView, currentFolderId, folders, findFolderById, onFolderChange]);

  // Drag-to-select handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentView !== "all") return;

    const target = e.target as HTMLElement;

    // Don't start drag selection if clicking on buttons or inputs
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "A" ||
      target.tagName === "BUTTON" ||
      target.closest("button, input, textarea, a")
    ) {
      return;
    }

    // Don't start selection if clicking on any card - let the card's onClick handler deal with it
    const clickedFileCard = target.closest(".file-row");
    const clickedFolderCard = target.closest(".folder-card");

    if (clickedFileCard || clickedFolderCard) {
      // Clicking on a card - don't start drag selection
      // Let the card's click handler (which supports Cmd+click) handle it
      return;
    }

    // Only start drag selection when clicking on empty space
    // Always prevent text selection and default behavior
    e.preventDefault();
    e.stopPropagation();

    setIsSelecting(true);
    selectionStartContentRef.current = toContentPoint(e.clientX, e.clientY);
    setSelectionStart({ x: e.clientX, y: e.clientY });
    setSelectionEnd({ x: e.clientX, y: e.clientY });

    // Clear selection unless Cmd/Ctrl is held
    if (!e.metaKey && !e.ctrlKey) {
      setSelectedFileIds(new Set());
      setSelectedFolderIds(new Set());
    }
  };

  const updateDragSelection = useCallback(
    (clientX: number, clientY: number) => {
      if (!isSelecting || !selectionStartContentRef.current) return;

      const endContent = toContentPoint(clientX, clientY);
      const startClient = toClientPoint(
        selectionStartContentRef.current.x,
        selectionStartContentRef.current.y,
      );
      const endClient = toClientPoint(endContent.x, endContent.y);

      setSelectionStart(startClient);
      setSelectionEnd(endClient);

      // Get selection box bounds
      const box = {
        left: Math.min(startClient.x, endClient.x),
        right: Math.max(startClient.x, endClient.x),
        top: Math.min(startClient.y, endClient.y),
        bottom: Math.max(startClient.y, endClient.y),
      };

      // Check which items intersect with selection box
      const newSelectedFiles = new Set<string>();
      const newSelectedFolders = new Set<string>();

      // Check files
      fileCardRefs.current.forEach((element, blobId) => {
        const rect = element.getBoundingClientRect();
        if (rectsIntersect(box, rect)) {
          newSelectedFiles.add(blobId);
        }
      });

      // Check folders
      folderCardRefs.current.forEach((element, folderId) => {
        const rect = element.getBoundingClientRect();
        if (rectsIntersect(box, rect)) {
          newSelectedFolders.add(folderId);
        }
      });

      setSelectedFileIds(newSelectedFiles);
      setSelectedFolderIds(newSelectedFolders);
    },
    [isSelecting, toClientPoint, toContentPoint],
  );

  const handleMouseUp = useCallback(() => {
    // Always reset the dragging flag on mouse up, regardless of whether we were selecting
    const wasDragging = isDraggingSelectionRef.current;
    isDraggingSelectionRef.current = false;

    if (isSelecting) {
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      stopAutoScroll();
    }
    lastSelectionPointRef.current = null;
    selectionStartContentRef.current = null;
  }, [isSelecting, stopAutoScroll]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isSelecting || !selectionStart) return;

      if (e.buttons === 0) {
        handleMouseUp();
        return;
      }

      lastSelectionPointRef.current = { x: e.clientX, y: e.clientY };

      // Mark as dragging if moved more than 5 pixels
      const moved =
        Math.abs(e.clientX - selectionStart.x) > 5 ||
        Math.abs(e.clientY - selectionStart.y) > 5;
      if (moved) {
        isDraggingSelectionRef.current = true;
      }

      // Auto-scroll while drag-selecting near the viewport edges
      startAutoScroll(e.clientX, e.clientY);

      updateDragSelection(e.clientX, e.clientY);
    },
    [
      handleMouseUp,
      isSelecting,
      selectionStart,
      startAutoScroll,
      updateDragSelection,
    ],
  );

  // Helper function to check if rectangles intersect
  const rectsIntersect = (
    box: { left: number; right: number; top: number; bottom: number },
    rect: DOMRect,
  ) => {
    return !(
      box.right < rect.left ||
      box.left > rect.right ||
      box.bottom < rect.top ||
      box.top > rect.bottom
    );
  };

  // Add global mouse event listeners for drag selection
  useEffect(() => {
    if (isSelecting) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (!isSelecting) return;

    const handleScroll = () => {
      const lastPoint = lastSelectionPointRef.current;
      if (!lastPoint) return;
      updateDragSelection(lastPoint.x, lastPoint.y);
      startAutoScroll(lastPoint.x, lastPoint.y);
    };

    const scrollTarget: Window | HTMLElement = scrollContainer ?? window;
    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      scrollTarget.removeEventListener("scroll", handleScroll);
    };
  }, [isSelecting, scrollContainer, startAutoScroll, updateDragSelection]);

  const handleFolderDragStart = (folder: FolderNode, e: React.DragEvent) => {
    if (currentView !== "all") {
      return;
    }
    e.dataTransfer.effectAllowed = "move";

    // If dragging a non-selected item, select only that item
    let draggedFolderIds = Array.from(selectedFolderIds);
    let draggedFileIds = Array.from(selectedFileIds);

    if (!selectedFolderIds.has(folder.id)) {
      // Update the arrays immediately without waiting for state update
      draggedFolderIds = [folder.id];
      draggedFileIds = [];
      setSelectedFolderIds(new Set([folder.id]));
      setSelectedFileIds(new Set());
      lastSelectedFolderIdRef.current = folder.id;
    }

    e.dataTransfer.setData("text/plain", folder.id);

    // Only set folder data if there are folders to drag
    if (draggedFolderIds.length > 0) {
      const folderData = JSON.stringify({
        folderIds: draggedFolderIds,
        parentId: folder.parentId,
      });
      e.dataTransfer.setData("application/x-walrus-folder", folderData);
    }

    // Only set file data if there are files to drag
    if (draggedFileIds.length > 0) {
      const fileData = JSON.stringify({
        blobIds: draggedFileIds,
        currentFolderId: null,
      });
      e.dataTransfer.setData("application/x-walrus-file", fileData);
    }

    const dragGhost = document.createElement("div");
    const itemCount = draggedFolderIds.length + draggedFileIds.length;
    dragGhost.textContent =
      itemCount > 1 ? `${itemCount} items` : truncateFileName(folder.name, 32);
    dragGhost.style.position = "fixed";
    dragGhost.style.top = "-1000px";
    dragGhost.style.left = "-1000px";
    dragGhost.style.padding = "6px 10px";
    dragGhost.style.fontSize = "12px";
    dragGhost.style.borderRadius = "8px";
    dragGhost.style.background = "rgba(16, 185, 129, 0.15)";
    dragGhost.style.border = "1px solid rgba(16, 185, 129, 0.35)";
    dragGhost.style.color = "#d1fae5";
    dragGhost.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
    dragGhost.style.pointerEvents = "none";
    dragGhost.style.transform = "scale(0.6)";
    dragGhost.style.transformOrigin = "top left";
    document.body.appendChild(dragGhost);
    try {
      e.dataTransfer.setDragImage(dragGhost, 0, 0);
    } catch {}
    window.setTimeout(() => {
      dragGhost.remove();
    }, 0);
    setDraggedFolder(folder);
  };

  const handleFolderDragEnd = () => {
    setDraggedFolder(null);
    setDragOverFolderId(null);
    stopAutoScroll();
  };

  const handleFolderDragOverFolder = (folderId: string, e: React.DragEvent) => {
    if (!draggedFolder || currentView !== "all") return;
    if (draggedFolder.id === folderId) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
    // Auto-scroll on drag
    startAutoScroll(e.clientX, e.clientY);
  };

  const handleFolderDragLeaveFolder = (folderId: string) => {
    if (dragOverFolderId === folderId) {
      setDragOverFolderId(null);
    }
  };

  const handleFolderDropToFolder = async (
    targetFolderId: string,
    e: React.DragEvent,
  ) => {
    e.preventDefault();
    if (!draggedFolder || currentView !== "all") return;
    if (draggedFolder.id === targetFolderId) return;

    await moveFolderToFolder(
      draggedFolder.id,
      targetFolderId,
      draggedFolder.parentId,
    );
    setDraggedFolder(null);
    setDragOverFolderId(null);
  };

  const handleFileDragStart = (file: FileItem, e: React.DragEvent) => {
    if (currentView !== "all") return;
    e.dataTransfer.effectAllowed = "move";

    // If dragging a non-selected item, select only that item
    let draggedFileIds = Array.from(selectedFileIds);
    let draggedFolderIds = Array.from(selectedFolderIds);

    if (!selectedFileIds.has(file.blobId)) {
      // Update the arrays immediately without waiting for state update
      draggedFileIds = [file.blobId];
      draggedFolderIds = [];
      setSelectedFileIds(new Set([file.blobId]));
      setSelectedFolderIds(new Set());
      lastSelectedFileIdRef.current = file.blobId;
    }

    e.dataTransfer.setData("text/plain", file.blobId);

    // Only set file data if there are files to drag
    if (draggedFileIds.length > 0) {
      e.dataTransfer.setData(
        "application/x-walrus-file",
        JSON.stringify({
          blobIds: draggedFileIds,
          currentFolderId: file.folderId ?? null,
        }),
      );
    }

    // Only set folder data if there are folders to drag
    if (draggedFolderIds.length > 0) {
      e.dataTransfer.setData(
        "application/x-walrus-folder",
        JSON.stringify({
          folderIds: draggedFolderIds,
          parentId: null,
        }),
      );
    }

    const dragGhost = document.createElement("div");
    const itemCount = draggedFileIds.length + draggedFolderIds.length;
    dragGhost.textContent =
      itemCount > 1 ? `${itemCount} items` : truncateFileName(file.name, 32);
    dragGhost.style.position = "fixed";
    dragGhost.style.top = "-1000px";
    dragGhost.style.left = "-1000px";
    dragGhost.style.padding = "6px 10px";
    dragGhost.style.fontSize = "12px";
    dragGhost.style.borderRadius = "8px";
    dragGhost.style.background = "rgba(16, 185, 129, 0.15)";
    dragGhost.style.border = "1px solid rgba(16, 185, 129, 0.35)";
    dragGhost.style.color = "#d1fae5";
    dragGhost.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
    dragGhost.style.pointerEvents = "none";
    dragGhost.style.transform = "scale(0.6)";
    dragGhost.style.transformOrigin = "top left";
    document.body.appendChild(dragGhost);
    try {
      e.dataTransfer.setDragImage(dragGhost, 0, 0);
    } catch {}
    window.setTimeout(() => {
      dragGhost.remove();
    }, 0);
    setDraggedFile(file);
  };

  const handleFileDragEnd = () => {
    setDraggedFile(null);
    setDragOverFolderId(null);
    setDragOverFileId(null);
    stopAutoScroll();
  };

  const handleFolderDragOver = (folderId: string, e: React.DragEvent) => {
    if (!draggedFile || currentView !== "all") return;
    if (draggedFile.folderId === folderId) {
      e.dataTransfer.dropEffect = "none";
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
    // Auto-scroll on drag
    startAutoScroll(e.clientX, e.clientY);
  };

  const handleFolderDragLeave = (folderId: string) => {
    if (dragOverFolderId === folderId) {
      setDragOverFolderId(null);
    }
  };

  const handleFileDragOver = (
    fileId: string,
    e: React.DragEvent<HTMLDivElement>,
  ) => {
    if (!draggedFile || currentView !== "all") return;
    if (draggedFile.blobId === fileId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFileId(fileId);
    // Auto-scroll on drag
    startAutoScroll(e.clientX, e.clientY);
  };

  const handleFileDragLeave = (fileId: string) => {
    if (dragOverFileId === fileId) {
      setDragOverFileId(null);
    }
  };

  const handleFolderDrop = async (folderId: string, e: React.DragEvent) => {
    // Check if this is an internal drag - if not, let it bubble to parent
    const isInternalDrag =
      e.dataTransfer.types.includes("application/x-walrus-file") ||
      e.dataTransfer.types.includes("application/x-walrus-folder");

    if (!isInternalDrag) {
      // External file drop - let it bubble to parent handler
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (currentView !== "all") return;

    const draggedFileIds = Array.from(selectedFileIds);
    const draggedFolderIds = Array.from(selectedFolderIds);

    // Move folders
    if (draggedFolderIds.length > 0) {
      for (const folderIdToMove of draggedFolderIds) {
        if (folderIdToMove !== folderId) {
          const folderToMove = findFolderById(folders, folderIdToMove);
          if (folderToMove && folderToMove.parentId !== folderId) {
            await moveFolderToFolder(
              folderIdToMove,
              folderId,
              folderToMove.parentId,
            );
          }
        }
      }
    }

    // Move files
    if (draggedFileIds.length > 0) {
      // Group files by their current folder and move each group separately
      const filesBySourceFolder = new Map<string | null, string[]>();

      const resolvedFileIds = new Set<string>();
      for (const fileId of draggedFileIds) {
        const resolvedId = resolveBlobId(fileId);
        if (resolvedFileIds.has(resolvedId)) continue;
        resolvedFileIds.add(resolvedId);
        const file = files.find((f) => f.blobId === resolvedId);
        if (file) {
          const sourceFolder = file.folderId ?? null;
          if (!filesBySourceFolder.has(sourceFolder)) {
            filesBySourceFolder.set(sourceFolder, []);
          }
          filesBySourceFolder.get(sourceFolder)!.push(resolvedId);
        }
      }

      // Move each group of files from their source folder to the target folder
      for (const [sourceFolder, fileIds] of filesBySourceFolder.entries()) {
        if (sourceFolder !== folderId) {
          await moveFilesToFolder(fileIds, folderId, sourceFolder);
        }
      }
    }

    setDraggedFile(null);
    setDraggedFolder(null);
    setDragOverFolderId(null);
    clearSelection();
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
          setShareError("Share Not Available");
          setTimeout(() => setShareError(null), 5000);
          setShareActiveId(null);
          return;
        }

        if (fileData.status === "failed") {
          setShareError(
            "This file is still being uploaded to Walrus. Please wait before sharing.",
          );
          setTimeout(() => setShareError(null), 5000);
          setShareActiveId(null);
          return;
        }

        // Check if file still has temp blobId (incomplete Walrus upload)
        if (blobId.startsWith("temp_")) {
          setShareError("Share Not Available");
          setTimeout(() => setShareError(null), 5000);
          setShareActiveId(null);
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

      // Optimistic update - update UI immediately
      setStarredMap((prev) => {
        const next = new Map(prev);
        next.set(blobId, nextStarred);
        return next;
      });

      onStarToggle?.(blobId, nextStarred);

      try {
        const res = await fetch(apiUrl(`/api/cache/${blobId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, starred: nextStarred }),
        });

        if (!res.ok) {
          throw new Error("Failed to update star");
        }

        if (currentView === "favorites" && !nextStarred) {
        }
      } catch (err) {
        console.error("Failed to update star:", err);
        // Revert optimistic update on error
        setStarredMap((prev) => {
          const next = new Map(prev);
          next.set(blobId, !nextStarred);
          return next;
        });
        onStarToggle?.(blobId, !nextStarred);
      }
    },
    [currentView, onStarToggle],
  );

  const copyBlobId = useCallback((blobId: string, status?: string) => {
    // Check if file has temporary ID (incomplete Walrus upload)
    if (blobId.startsWith("temp_")) {
      setShareError(
        "Cannot copy ID while file is still decentralizing. Please wait.",
      );
      setTimeout(() => setShareError(null), 5000);
      return;
    }
    // Check if file is still processing
    if (status === "pending" || status === "processing") {
      setShareError(
        "Cannot copy ID while file is still processing. Please wait.",
      );
      setTimeout(() => setShareError(null), 5000);
      return;
    }
    navigator.clipboard.writeText(blobId);
    setCopiedId(blobId);
    // Reset after 1 second
    setTimeout(() => setCopiedId(null), 1000);
  }, []);

  const handleDelete = useCallback(
    (blobId: string, fileName: string, status?: FileItem["status"]) => {
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
    const blobIdToDelete = fileToDelete.blobId;

    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        setDeleteError("You must be logged in to delete files");
        setTimeout(() => setDeleteError(null), 5000);
        return;
      }

      // Optimistic update: immediately hide file from UI
      setLocallyDeletedBlobIds((prev) => new Set(prev).add(blobIdToDelete));

      // Close dialog and notify parent
      removeCachedFile(blobIdToDelete);
      setDeleteDialogOpen(false);
      setFileToDelete(null);
      onFileDeleted?.(blobIdToDelete);

      // Then send delete request to server
      const res = await deleteBlob(blobIdToDelete, user.id);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
    } catch (err: any) {
      console.error("[confirmDelete] Error:", err);
      setDeleteError(err?.message || "Failed to delete file");
      setTimeout(() => setDeleteError(null), 5000);
      // On error, remove from locally deleted set and refresh
      setLocallyDeletedBlobIds((prev) => {
        const next = new Set(prev);
        next.delete(fileToDelete?.blobId || "");
        return next;
      });
      // Refresh to restore UI from server state
      onFileDeleted?.(undefined);
    } finally {
      setDeletingId(null);
    }
  }, [fileToDelete, onFileDeleted]);

  // Auto-trigger background processing for pending files (and retry failed when no pending remain)
  useEffect(() => {
    const hasPendingOrFailed = files.some(
      (f) => f.status === "pending" || f.status === "failed",
    );
    if (!hasPendingOrFailed) return;

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

  // Long-lived SSE connection for file status updates
  useEffect(() => {
    const POLLING_MAX_DURATION = 5 * 60 * 1000; // 5 minutes - stop tracking if file stuck that long
    const user = authService.getCurrentUser();
    if (!user?.id) return;

    const calculateIdsToWatch = () => {
      return files
        .filter((f) => {
          const effective = fileStatusMapRef.current.get(f.blobId) ?? f.status;
          const effectiveBlobId =
            fileBlobIdMapRef.current.get(f.blobId) ?? f.blobId;

          if (
            effective === "completed" &&
            !effectiveBlobId.startsWith("temp_")
          ) {
            return false;
          }

          const uploadedTime = new Date(f.uploadedAt).getTime();
          if (Date.now() - uploadedTime > POLLING_MAX_DURATION) {
            return false;
          }

          return (
            effective === "pending" ||
            effective === "processing" ||
            effective === "failed" ||
            (effective === "completed" && effectiveBlobId.startsWith("temp_"))
          );
        })
        .map((f) => f.blobId)
        .sort()
        .join(",");
    };

    const initialIds = calculateIdsToWatch();
    if (!initialIds) return;

    let source: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_DELAY = 30000; // 30 seconds max

    const connect = () => {
      const currentIds = calculateIdsToWatch();
      if (!currentIds) {
        if (source) {
          source.close();
          source = null;
        }
        return;
      }

      const params = new URLSearchParams({
        userId: user.id,
        ids: currentIds,
      });

      source = new EventSource(apiUrl(`/api/files/stream?${params}`));

      const handleStatus = (event: MessageEvent) => {
        reconnectAttempts = 0; // Reset on successful message
        try {
          const data = JSON.parse(event.data || "{}");
          if (data.status && data.id) {
            setFileStatusMap((prev) => {
              const next = new Map(prev);
              next.set(data.id, data.status);
              return next;
            });
          }
          if (data.blobId && data.id && data.blobId !== data.id) {
            setFileBlobIdMap((prev) => {
              const next = new Map(prev);
              next.set(data.id, data.blobId);
              return next;
            });
          }
        } catch (err) {
          console.error("[sseFileStatus] Failed to parse message", err);
        }
      };

      const handleError = () => {
        source?.close();
        source = null;

        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (max)
        const delay = Math.min(
          2000 * Math.pow(2, reconnectAttempts),
          MAX_RECONNECT_DELAY,
        );
        reconnectAttempts++;
        reconnectTimeout = setTimeout(connect, delay);
      };

      source.addEventListener("status", handleStatus);
      source.addEventListener("error", handleError);
    };

    connect();

    // Periodically check if the IDs to watch have changed
    const recheckInterval = setInterval(() => {
      const newIds = calculateIdsToWatch();
      const currentIds = source
        ? new URL(source.url).searchParams.get("ids")
        : null;

      // Reconnect if ID list changed significantly
      if (newIds !== currentIds) {
        if (source) {
          source.close();
          source = null;
        }
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        if (newIds) {
          reconnectAttempts = 0;
          connect();
        }
      }
    }, 15000); // Check every 15 seconds

    return () => {
      clearInterval(recheckInterval);
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (source) {
        source.close();
      }
    };
  }, [files, _folderRefreshKey]);

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

        const res = await downloadBlob(
          blobId,
          privateKey || "",
          name,
          user?.id,
        );
        if (!res.ok) {
          let detail = "Download failed";
          try {
            const payload = await (res as Response).json();
            detail = payload?.error ?? detail;
          } catch {}
          setDownloadError(detail);
          setTimeout(() => setDownloadError(null), 5000);
          return;
        }
        if ("presigned" in res && res.presigned) return;

        const blob = await (res as Response).blob();

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
              "Decryption failed: The file could not be decrypted with your key.",
            );
            setTimeout(() => setDownloadError(null), 5000);
            return;
          }
        }

        if (!encrypted && privateKey && blob.size > 0) {
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

  const daysPerEpoch = useDaysPerEpoch();

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

    // Prefer server truth when file is completed with real blobId so we don't show
    // "failed" from stale SSE/fileStatusMap; after refresh or list refetch we show Walrus.
    const serverCompletedWithRealBlobId =
      f.status === "completed" && !f.blobId.startsWith("temp_");
    const displayStatus = serverCompletedWithRealBlobId
      ? "completed"
      : (fileStatusMap.get(f.blobId) ?? f.status);
    const displayBlobId = serverCompletedWithRealBlobId
      ? f.blobId
      : (fileBlobIdMap.get(f.blobId) ?? f.blobId);
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
          const decryptResult = await decryptWithSharedKey(
            blob,
            shareKey,
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
      await handleSaveSharedFile(f, shareInfo, skipReauthCheck);
    };

    const fileIndex = currentLevelFiles.findIndex(
      (file) => file.blobId === f.blobId,
    );
    const isMoving = locallyMovedBlobIds.has(f.blobId);
    const isSelected = selectedFileIds.has(f.blobId);
    return (
      <div
        key={f.blobId}
        ref={(el) => {
          if (el) fileCardRefs.current.set(f.blobId, el);
          else fileCardRefs.current.delete(f.blobId);
        }}
        onClick={(e) => handleFileClick(f.blobId, e)}
        className={`file-row group relative rounded-xl border p-4 shadow-sm w-full transition-transform duration-150 origin-center stagger-${Math.min(fileIndex + 1, 10)} ${
          isMoving ? "moving-out" : ""
        } ${
          isSelected
            ? "border-emerald-400/70 bg-emerald-900/50"
            : dragOverFileId === f.blobId
              ? "border-emerald-400/70 bg-emerald-900/40"
              : isExpiringSoon && currentView === "expiring"
                ? "border-emerald-800/50 bg-emerald-950/40"
                : currentView === "shared"
                  ? "border-emerald-800/50 bg-emerald-950/40"
                  : currentView === "recents"
                    ? "border-emerald-800/50 bg-emerald-950/30"
                    : "border-emerald-800/50 bg-emerald-950/30"
        } ${currentView === "all" ? "cursor-grab" : ""} ${
          draggedFile?.blobId === f.blobId ? "opacity-80" : ""
        }`}
        draggable={currentView === "all"}
        onDragStart={(e) => handleFileDragStart(f, e)}
        onDragEnd={handleFileDragEnd}
        onDragOver={(e) => handleFileDragOver(f.blobId, e)}
        onDragLeave={() => handleFileDragLeave(f.blobId)}
        onDrop={async (e) => {
          // Check if this is an internal drag - if not, let it bubble to parent
          const isInternalDrag =
            e.dataTransfer.types.includes("application/x-walrus-file") ||
            e.dataTransfer.types.includes("application/x-walrus-folder");

          if (!isInternalDrag) {
            // External file drop - let it bubble to parent handler
            return;
          }

          // Handle dropping files on another file (move all selected files to the same folder as target file)
          e.preventDefault();
          e.stopPropagation();
          if (currentView !== "all") return;

          const draggedFileIds = Array.from(selectedFileIds);
          const draggedFolderIds = Array.from(selectedFolderIds);
          const targetBlobId = resolveBlobId(f.blobId);

          // Move folders
          if (draggedFolderIds.length > 0) {
            for (const folderIdToMove of draggedFolderIds) {
              if (folderIdToMove !== f.blobId) {
                const folderToMove = findFolderById(folders, folderIdToMove);
                if (
                  folderToMove &&
                  folderToMove.parentId !== (f.folderId ?? null)
                ) {
                  await moveFolderToFolder(
                    folderIdToMove,
                    f.folderId ?? null,
                    folderToMove.parentId,
                  );
                }
              }
            }
          }

          // Move files - move all selected files to the same folder as the target file
          if (draggedFileIds.length > 0) {
            // Group files by their current folder and move each group separately
            const filesBySourceFolder = new Map<string | null, string[]>();

            const resolvedFileIds = new Set<string>();
            for (const fileId of draggedFileIds) {
              const resolvedId = resolveBlobId(fileId);
              if (resolvedFileIds.has(resolvedId)) continue;
              resolvedFileIds.add(resolvedId);
              const file = files.find((file) => file.blobId === resolvedId);
              if (file && resolvedId !== targetBlobId) {
                const sourceFolder = file.folderId ?? null;
                if (!filesBySourceFolder.has(sourceFolder)) {
                  filesBySourceFolder.set(sourceFolder, []);
                }
                filesBySourceFolder.get(sourceFolder)!.push(resolvedId);
              }
            }

            // Move each group of files from their source folder to the target folder
            for (const [
              sourceFolder,
              fileIds,
            ] of filesBySourceFolder.entries()) {
              if (sourceFolder !== (f.folderId ?? null)) {
                moveFilesToFolder(fileIds, f.folderId ?? null, sourceFolder);
              }
            }
          }

          setDraggedFile(null);
          setDraggedFolder(null);
          setDragOverFileId(null);
          clearSelection();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpenMenuId(f.blobId);
          setFileMenuAnchorRect(new DOMRect(e.clientX, e.clientY, 0, 0));
          setFileMenuPosition({
            top: e.clientY + 4,
            left: e.clientX + 4,
          });
        }}
      >
        <div className="flex items-start gap-3 w-full">
          <div className="file-icon-wrapper flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
            {f.encrypted ? (
              <Lock className="file-lock-icon h-5 w-5 text-green-400" />
            ) : (
              <LockOpen className="file-lock-icon h-5 w-5 text-gray-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-gray-100 truncate">
                {truncateFileName(f.name)}
              </p>
              <span className="inline-flex items-center gap-1 ml-2">
                {/* Walrus badge: completed with real blobId */}
                {displayStatus === "completed" &&
                  !displayBlobId.startsWith("temp_") && (
                    <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.walrus}>
                      <span className="status-badge completed encryption-badge inline-flex items-center gap-1 rounded-full bg-emerald-900/30 px-2 py-0.5 text-xs font-medium text-emerald-300">
                        <HardDrive className="h-3 w-3" />
                        Walrus
                      </span>
                    </StatusBadgeTooltip>
                  )}

                {/* Decentralizing badge: processing (actively uploading to Walrus) */}
                {displayStatus === "processing" && (
                  <StatusBadgeTooltip
                    title={STATUS_BADGE_TOOLTIPS.decentralizing}
                  >
                    <span className="status-badge processing inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Decentralizing
                    </span>
                  </StatusBadgeTooltip>
                )}

                {/* Pending badge: waiting to upload, completed-with-temp-blobId, or failed (will retry; same UX as pending) */}
                {(displayStatus === "pending" ||
                  displayStatus === "failed" ||
                  (displayStatus === "completed" &&
                    displayBlobId.startsWith("temp_"))) && (
                  <StatusBadgeTooltip title={STATUS_BADGE_TOOLTIPS.pending}>
                    <span className="status-badge processing inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Pending
                    </span>
                  </StatusBadgeTooltip>
                )}
              </span>
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
                        {shareDaysRemaining !== null
                          ? shareDaysRemaining > 0
                            ? `Link Valid: ${shareDaysRemaining}d`
                            : "Link Expired"
                          : "Link Valid: Never expires"}
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
                  const needsKey = shareInfo.encrypted;
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

                  if (needsKey && !isSharedByOthers) {
                    // First, try to use the stored share key (generated when share was created)
                    const storedKey = getStoredShareKey(shareInfo.shareId);
                    if (storedKey) {
                      shareUrl = `${shareUrl}#k=${storedKey}`;
                      setFullShareUrls((prev) =>
                        new Map(prev).set(f.blobId, shareUrl),
                      );
                      return shareUrl;
                    }

                    // Fallback: If no stored key and we have private key, try to derive it
                    if (effectivePrivateKey) {
                      try {
                        const user = authService.getCurrentUser();
                        const blobRes = await downloadBlob(
                          shareInfo.blobId,
                          "",
                          undefined,
                          user?.id,
                        );
                        if (!blobRes.ok)
                          throw new Error("Failed to download blob");
                        const blobData = await blobRes.blob();
                        const fileKeyBase64url = await exportFileKeyForShare(
                          blobData,
                          effectivePrivateKey,
                        );
                        shareUrl = `${shareUrl}#k=${fileKeyBase64url}`;

                        // Store the derived key for future use
                        try {
                          localStorage.setItem(
                            `walrus_share_key:${shareInfo.shareId}`,
                            fileKeyBase64url,
                          );
                          sessionStorage.setItem(
                            `walrus_share_key:${shareInfo.shareId}`,
                            fileKeyBase64url,
                          );
                        } catch (storageErr) {
                          console.warn(
                            "[getFullShareUrl] Failed to store share key:",
                            storageErr,
                          );
                        }

                        setFullShareUrls((prev) =>
                          new Map(prev).set(f.blobId, shareUrl),
                        );
                      } catch (err) {
                        console.error(
                          "Failed to extract file key for share link:",
                          err,
                        );
                        // Return base URL without key on error
                        setFullShareUrls((prev) =>
                          new Map(prev).set(f.blobId, shareUrl),
                        );
                      }
                    } else {
                      // No stored key and no private key available
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

                  if (shareInfo.encrypted && !privateKey && !isSharedByOthers) {
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

                const handleUnshare = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  if (!shareInfo?.shareId) return;

                  setShareToUnshare({
                    shareId: shareInfo.shareId,
                    blobId: f.blobId,
                    filename: shareInfo.filename || f.name,
                  });
                  setUnshareDialogOpen(true);
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
                          <button
                            onClick={handleUnshare}
                            disabled={revokingShareId === shareInfo.shareId}
                            className="text-xs px-2 py-1 rounded bg-red-900/30 hover:bg-red-900/50 text-red-300 hover:text-red-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {revokingShareId === shareInfo.shareId ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Unsharing...
                              </>
                            ) : (
                              <>Unshare</>
                            )}
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
                      id: f.id,
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
              </div>
              <button
                title={isStarred ? "Unfavorite" : "Favorite"}
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStar(f.blobId, !isStarred);
                }}
                className={`p-2 rounded-lg transition-colors ${
                  isStarred ||
                  downloadingId === f.blobId ||
                  shareActiveId === f.blobId
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                } hover:bg-zinc-800 dark:hover:bg-zinc-700 group`}
              >
                <Star
                  className={`h-5 w-5 transition-all ${
                    isStarred
                      ? "text-emerald-300 fill-emerald-300"
                      : "text-gray-400 hover:text-emerald-300"
                  }`}
                />
              </button>

              {/* File menu button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (openMenuId === f.blobId) {
                    setOpenMenuId(null);
                    setFileMenuPosition(null);
                    setFileMenuAnchorRect(null);
                  } else {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pos = {
                      top: rect.bottom + 6,
                      left: Math.max(8, rect.right - 160),
                    };
                    setFileMenuAnchorRect(rect);
                    // Prevent the backdrop's click handler from immediately closing
                    // the menu due to the same mouse event: set a short-lived
                    // ignore flag and open synchronously.
                    setFileMenuPosition(pos);
                    ignoreBackdropClickRef.current = true;
                    setOpenMenuId(f.blobId);
                    // Clear the ignore flag after the current event loop tick
                    setTimeout(
                      () => (ignoreBackdropClickRef.current = false),
                      0,
                    );
                  }
                }}
                className="p-2 hover:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <MoreVertical className="h-5 w-5 text-gray-400" />
              </button>
            </div>
          )}

          {/* File dropdown menu - rendered via portal to avoid flickering during re-renders */}
          {openMenuId === f.blobId &&
            fileMenuPosition &&
            typeof window !== "undefined" &&
            createPortal(
              <>
                {/* Backdrop to close menu and prevent clicks behind */}
                <div
                  className="fixed inset-0 z-[100]"
                  onClick={() => {
                    // ignore the backdrop click if it's from the same event that
                    // opened the menu (prevents immediate close/flash)
                    if (ignoreBackdropClickRef.current) return;
                    setOpenMenuId(null);
                    setFileMenuPosition(null);
                    setFileMenuAnchorRect(null);
                  }}
                />
                <div
                  ref={fileMenuRef}
                  className="fixed z-[101] bg-zinc-900 rounded-lg shadow-lg border border-zinc-800 py-1 min-w-[160px] max-h-[calc(100vh-16px)] overflow-y-auto"
                  style={{
                    top: `${fileMenuPosition.top}px`,
                    left: `${fileMenuPosition.left}px`,
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
                  {!expiry.isExpired && (
                    <button
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-left`}
                      onClick={() => {
                        const effectiveStatus = getEffectiveStatus(f);
                        const effectiveBlobId =
                          fileBlobIdMap.get(f.blobId) ?? f.blobId;
                        if (
                          !effectiveStatus ||
                          effectiveStatus !== "completed" ||
                          effectiveBlobId.startsWith("temp_")
                        ) {
                          setExtendError("Extend Not Available");
                          setTimeout(() => setExtendError(null), 5000);
                          setOpenMenuId(null);
                          return;
                        }
                        setSelectedFile(f);
                        setExtendDialogOpen(true);
                        setOpenMenuId(null);
                      }}
                    >
                      <CalendarPlus className={`h-4 w-4`} />
                      <span className={""}>Extend Duration</span>
                    </button>
                  )}
                  <button
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 dark:hover:bg-zinc-700 text-white text-left ${
                      currentView === "recents"
                        ? "bg-emerald-900/20 border-l-2 border-emerald-500"
                        : ""
                    }`}
                    onClick={() => {
                      setFileToMove({
                        id: f.id,
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
                      copyBlobId(displayBlobId, displayStatus);
                      // Keep menu open for 1 second after copying
                      if (copiedId !== f.blobId) {
                        setTimeout(() => setOpenMenuId(null), 1000);
                      }
                    }}
                  >
                    {copiedId === f.blobId ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copiedId === f.blobId ? "Copied!" : "Copy ID"}
                  </button>

                  <hr className="my-1 border-zinc-800" />
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-destructive-20 text-destructive dark:text-destructive-foreground text-left"
                    onClick={() => {
                      handleDelete(f.blobId, f.name, f.status);
                      setOpenMenuId(null);
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

    // Optimistically update UI immediately
    onFolderDeletedOptimistic?.(folderId);

    try {
      const res = await fetch(
        apiUrl(`/api/folders/${folderId}?userId=${user.id}`),
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        // Success - trigger final refresh to sync any other changes
        onFolderDeleted?.();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete folder");
        // On error, refresh to restore the folder in UI
        onFolderDeleted?.();
      }
    } catch (err) {
      console.error("Failed to delete folder:", err);
      // On error, refresh to restore the folder in UI
      onFolderDeleted?.();
    }
  };

  const isEmpty =
    currentLevelFolders.length === 0 && currentLevelFiles.length === 0;

  // Get view title
  const getViewTitle = () => {
    if (currentView === "favorites") return "Favorite Files";
    if (currentView === "recents") return "Recent Uploads";
    if (currentView === "shared") return "Shared Files";
    if (currentView === "expiring") return "Expiring Soon";
    return null;
  };

  const hasSelection = selectedFileIds.size > 0 || selectedFolderIds.size > 0;

  return (
    <div
      ref={selectionContainerRef}
      className={`space-y-6 relative min-h-full pb-16 ${draggedFile ? "dragging-file" : ""} ${isSelecting ? "cursor-crosshair" : ""} ${hasSelection ? "hover-disabled" : "hover-enabled"} ${currentView === "all" ? "-ml-4 pl-4 sm:-ml-6 sm:pl-6 lg:-ml-8 lg:pl-8" : ""}`}
      style={
        {
          userSelect: currentView === "all" ? "none" : "auto",
          WebkitUserSelect: currentView === "all" ? "none" : "auto",
          MozUserSelect: currentView === "all" ? "none" : "auto",
        } as React.CSSProperties
      }
      onClick={(e) => {
        // Clear selection when clicking on empty area in "all" view
        if (currentView === "all") {
          const target = e.target as HTMLElement;

          // Don't clear if using modifier keys (for multi-select)
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            return;
          }

          // Check if clicking on a card
          const clickedFileCard = target.closest(".file-row");
          const clickedFolderCard = target.closest(".folder-card");
          const clickedButton = target.closest(
            "button, input, a, [role='button']",
          );

          // If clicking on a card or button, let their handlers deal with it
          if (clickedFileCard || clickedFolderCard || clickedButton) {
            return;
          }

          // Clicking on blank space - clear selection
          clearSelection();
        }
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        // Only show context menu in "all" view for creating folders
        if (currentView === "all") {
          e.preventDefault();
          e.stopPropagation();
          setContentMenuPosition({
            top: e.clientY + 4,
            left: e.clientX + 4,
          });
        }
      }}
    >
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
                onDragOver={(e) => {
                  if (
                    currentFolderId !== null &&
                    (draggedFile || draggedFolder)
                  ) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverBreadcrumbId(item.id ?? "root");
                    // Auto-scroll on drag
                    startAutoScroll(e.clientX, e.clientY);
                  }
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragOverBreadcrumbId(null);
                }}
                onDrop={async (e) => {
                  // Check if this is an internal drag - if not, let it bubble to parent
                  const isInternalDrag =
                    e.dataTransfer.types.includes(
                      "application/x-walrus-file",
                    ) ||
                    e.dataTransfer.types.includes(
                      "application/x-walrus-folder",
                    );

                  if (!isInternalDrag) {
                    // External file drop - let it bubble to parent handler
                    return;
                  }

                  e.preventDefault();
                  e.stopPropagation();
                  // Allow dropping files and folders on breadcrumb items (including root)
                  // Handle file drops - use all selected files, not just draggedFile
                  const draggedFileIds = Array.from(selectedFileIds);
                  if (draggedFileIds.length > 0) {
                    // Group files by their current folder and move each group separately
                    const filesBySourceFolder = new Map<
                      string | null,
                      string[]
                    >();

                    const resolvedFileIds = new Set<string>();
                    for (const fileId of draggedFileIds) {
                      const resolvedId = resolveBlobId(fileId);
                      if (resolvedFileIds.has(resolvedId)) continue;
                      resolvedFileIds.add(resolvedId);
                      const file = files.find((f) => f.blobId === resolvedId);
                      if (file) {
                        const sourceFolder = file.folderId ?? null;
                        if (!filesBySourceFolder.has(sourceFolder)) {
                          filesBySourceFolder.set(sourceFolder, []);
                        }
                        filesBySourceFolder.get(sourceFolder)!.push(resolvedId);
                      }
                    }

                    // Move each group of files from their source folder to the target folder
                    for (const [
                      sourceFolder,
                      fileIds,
                    ] of filesBySourceFolder.entries()) {
                      if (sourceFolder !== item.id) {
                        moveFilesToFolder(fileIds, item.id, sourceFolder);
                      }
                    }
                    setDraggedFile(null);
                  }
                  // Handle folder drops
                  const draggedFolderIds = Array.from(selectedFolderIds);
                  if (draggedFolderIds.length > 0) {
                    for (const folderIdToMove of draggedFolderIds) {
                      if (folderIdToMove !== item.id) {
                        const folderToMove = findFolderById(
                          folders,
                          folderIdToMove,
                        );
                        if (folderToMove) {
                          // Only move if not already in target location
                          if (folderToMove.parentId !== item.id) {
                            await moveFolderToFolder(
                              folderIdToMove,
                              item.id,
                              folderToMove.parentId,
                            );
                          }
                        }
                      }
                    }
                    setDraggedFolder(null);
                  }
                  setDragOverFolderId(null);
                  setDragOverBreadcrumbId(null);
                  clearSelection();
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors border ${
                  index === folderPath.length - 1
                    ? "bg-emerald-900/40 text-emerald-300 font-medium border-emerald-700/50"
                    : dragOverBreadcrumbId === (item.id ?? "root")
                      ? "bg-emerald-900/60 border-emerald-400/70 text-emerald-300"
                      : "border-transparent hover:bg-zinc-800 text-gray-400"
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
                className="create-folder-btn group relative rounded-xl border-2 border-dashed border-emerald-700 bg-emerald-950/20 p-8 shadow-sm flex flex-col items-center justify-center min-h-[160px]"
              >
                <FolderPlus className="folder-plus-icon h-12 w-12 text-emerald-400 mb-3" />
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
                className="create-folder-btn group relative rounded-xl border-2 border-dashed border-emerald-700 bg-emerald-950/20 p-8 shadow-sm flex flex-col items-center justify-center min-h-[160px]"
              >
                <FolderPlus className="folder-plus-icon h-12 w-12 text-emerald-400 mb-3" />
                <span className="text-sm font-medium text-emerald-300">
                  Create New Folder
                </span>
              </button>
            </div>
          </div>
        )}

      {/* Folders Grid - Show ONLY in 'all' view when at root or in a folder with subfolders */}
      {currentView === "all" && currentLevelFolders.length > 0 && (
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContentMenuPosition({
              top: e.clientY + 4,
              left: e.clientX + 4,
            });
          }}
        >
          {/* Spacer above header so drag selection can start in this area */}
          <div className="h-4" onMouseDown={handleMouseDown} />
          {currentFolderId === null && (
            <h3 className="text-sm font-medium text-gray-300 mb-3">Folders</h3>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {currentLevelFolders.map((folder, index) => {
              const isSelected = selectedFolderIds.has(folder.id);
              return (
                <div
                  key={folder.id}
                  ref={(el) => {
                    if (el) folderCardRefs.current.set(folder.id, el);
                    else folderCardRefs.current.delete(folder.id);
                  }}
                  className={`folder-card group relative rounded-xl border-2 ${
                    isSelected
                      ? "border-emerald-400/70 bg-emerald-900/50"
                      : dragOverFolderId === folder.id
                        ? "border-emerald-400/70 bg-emerald-900/40"
                        : "border-emerald-800/50 bg-emerald-950/30"
                  } p-4 shadow-sm cursor-pointer ${
                    shouldAnimateFolders
                      ? `stagger-${Math.min(index + 1, 10)}`
                      : "no-animate"
                  } ${draggedFile ? "dragging" : ""}`}
                  draggable={currentView === "all"}
                  onDragStart={(e) => handleFolderDragStart(folder, e)}
                  onDragEnd={handleFolderDragEnd}
                  onClick={(e) => {
                    if (openFolderMenuId === folder.id) {
                      setOpenFolderMenuId(null);
                      setFolderMenuPosition(null);
                      return;
                    }
                    handleFolderClick(folder.id, e);
                  }}
                  onDragOver={(e) => {
                    handleFolderDragOver(folder.id, e);
                    handleFolderDragOverFolder(folder.id, e);
                  }}
                  onDragLeave={() => {
                    handleFolderDragLeave(folder.id);
                    handleFolderDragLeaveFolder(folder.id);
                  }}
                  onDrop={(e) => handleFolderDrop(folder.id, e)}
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
                    <div className="folder-icon-wrapper mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
                      <Folder
                        className="h-10 w-10 transition-all duration-300"
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
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State for folder with no files (only in 'all' view) */}
      {currentView === "all" &&
        currentFolderId !== null &&
        currentLevelFiles.length === 0 &&
        currentLevelFolders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="empty-state-icon relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
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
      {/* Empty State for special views */}
      {currentView !== "all" && currentLevelFiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="empty-state-icon relative mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-900/40 to-teal-900/40">
            {currentView === "recents" && (
              <Clock className="h-12 w-12 text-emerald-400" />
            )}
            {currentView === "shared" && (
              <Share2 className="h-12 w-12 text-emerald-400" />
            )}
            {currentView === "expiring" && (
              <AlertCircle className="h-12 w-12 text-orange-600 dark:text-orange-400" />
            )}
            {currentView === "favorites" && (
              <Star className="h-12 w-12 text-emerald-400" />
            )}
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {currentView === "recents" && "No recently uploaded files"}
            {currentView === "shared" && "No shared files"}
            {currentView === "expiring" && "No files expiring soon"}
            {currentView === "favorites" && "No favorite files yet"}
          </h3>
          <p className="text-gray-300 max-w-md">
            {currentView === "recents" && "Upload some files to see them here."}
            {currentView === "shared" &&
              "Share a file to see it here with its share link and expiry information."}
            {currentView === "expiring" &&
              "All your files have more than 10 days remaining."}
            {currentView === "favorites" &&
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
        onFolderCreated={(folder) => {
          onFolderCreated?.(folder);
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
          encrypted={shareFile.encrypted}
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

      <DeleteConfirmDialog
        open={unshareDialogOpen}
        onOpenChange={(open) => {
          setUnshareDialogOpen(open);
          if (!open) setShareToUnshare(null);
        }}
        fileName={shareToUnshare?.filename || ""}
        title={"Are you sure you want to do this?"}
        description={
          "This will invalidate the existing share link and prevent access."
        }
        confirmLabel={"Unshare"}
        onConfirm={confirmUnshare}
      />

      {fileToMove && (
        <MoveFileDialog
          open={moveDialogOpen}
          onClose={() => {
            setMoveDialogOpen(false);
            setFileToMove(null);
          }}
          files={moveDialogFiles}
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

                const encryptedBlob = await encryptFile(
                  fileToUpload,
                  privateKey || "",
                );

                const uploadMode = "async" as const;
                const resp = await uploadBlob(
                  encryptedBlob,
                  privateKey || "",
                  undefined,
                  undefined,
                  user.id,
                  fileToUpload.name,
                  undefined,
                  true,
                  epochs,
                  uploadMode,
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

      {/* Content Context Menu - Right-click to create folder */}
      {contentMenuPosition &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-[110]"
              onClick={() => setContentMenuPosition(null)}
            />
            {/* Menu */}
            <div
              ref={contentMenuRef}
              className="fixed z-[111] bg-zinc-900 rounded-lg shadow-lg border border-zinc-800 py-1 min-w-[180px]"
              style={{
                top: `${contentMenuPosition.top}px`,
                left: `${contentMenuPosition.left}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                onClick={() => {
                  setCreateFolderParentId(currentFolderId);
                  setCreateFolderDialogOpen(true);
                  setContentMenuPosition(null);
                }}
              >
                <FolderPlus className="h-4 w-4" />
                New Folder
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800 text-white text-left"
                onClick={() => {
                  onUploadClick();
                  setContentMenuPosition(null);
                }}
              >
                <Upload className="h-4 w-4" />
                Upload
              </button>
            </div>
          </>,
          document.body,
        )}

      {/* Error notifications */}
      {deleteError && deleteError.toLowerCase().includes("decentraliz") && (
        <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">
                Decentralizing
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">{deleteError}</p>
            </div>
          </div>
        </div>
      )}

      {deleteError && !deleteError.toLowerCase().includes("decentraliz") && (
        <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">
                Decentralizing
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">{deleteError}</p>
            </div>
          </div>
        </div>
      )}

      {downloadError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20 animate-fade-in z-[60]">
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

      {dragMoveError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20 animate-fade-in z-[60]">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                Move Failed
              </p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                {dragMoveError}
              </p>
            </div>
          </div>
        </div>
      )}

      {shareError && (
        <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">
                Decentralizing
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">{shareError}</p>
            </div>
          </div>
        </div>
      )}

      {extendError && (
        <div className="fixed bottom-4 right-4 z-[60] w-[340px] max-w-[calc(100vw-32px)] rounded-[10px] border border-[#0B3F2E] bg-[#050505] px-[14px] py-[12px] shadow-[0_0_8px_rgba(11,63,46,0.25)] animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-emerald-300 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-100">
                Decentralizing
              </p>
              <p className="text-sm text-emerald-100/80 mt-1">{extendError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Note: Click outside handlers are now handled by individual menu backdrops */}

      {/* Selection Overlay - Prevents text selection during drag */}
      {isSelecting && (
        <div
          className="fixed inset-0 z-[99] cursor-crosshair"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            MozUserSelect: "none",
            msUserSelect: "none",
          }}
        />
      )}

      {/* Drag Selection Box Overlay */}
      {isSelecting && selectionStart && selectionEnd && (
        <div
          className="fixed pointer-events-none z-[100]"
          style={{
            left: `${Math.min(selectionStart.x, selectionEnd.x)}px`,
            top: `${Math.min(selectionStart.y, selectionEnd.y)}px`,
            width: `${Math.abs(selectionEnd.x - selectionStart.x)}px`,
            height: `${Math.abs(selectionEnd.y - selectionStart.y)}px`,
            backgroundColor: "rgba(16, 185, 129, 0.15)",
            border: "2px solid rgba(16, 185, 129, 0.6)",
            borderRadius: "4px",
          }}
        />
      )}
    </div>
  );
}
