import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { useSearchParams } from "react-router-dom";
import UploadSection from "./components/UploadSection";
import UploadToast from "./components/UploadToast";
import FolderTree from "./components/SideBar";
import FolderCardView from "./components/FolderCardView";
import CreateFolderDialog from "./components/CreateFolderDialog";
import { InsufficientFundsDialog } from "./components/InsufficientFundsDialog";
import { Dialog, DialogContent } from "./components/ui/dialog";
import { getServerOrigin, apiUrl } from "./config/api";
import { addCachedFile, CachedFile } from "./lib/fileCache";
import {
  PanelLeftClose,
  PanelLeft,
  X,
  Home,
  Upload,
  Clock,
  Share2,
  AlertTriangle,
  Star,
  FolderPlus,
  Folder,
  User,
  Wallet,
  LogOut,
  DollarSign,
} from "lucide-react";
import { authService } from "./services/authService";
import { getBalance } from "./services/balanceService";
import "./pages/css/Home.css";

export default function App() {
  const { isAuthenticated, setPrivateKey, privateKey, clearPrivateKey } =
    useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const uploadDialogFromPaymentRef = useRef(false);
  const [uploadedFiles, setUploadedFiles] = useState<CachedFile[]>([]);
  const [epochs, setEpochs] = useState(3); // Default: 3 epochs = 90 days
  const user = authService.getCurrentUser();

  // Folder system state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [currentView, setCurrentView] = useState<
    "all" | "recents" | "shared" | "expiring" | "favorites" | "upload-queue"
  >(() => {
    const viewParam = searchParams.get("view");
    if (
      viewParam === "favorites" ||
      viewParam === "recents" ||
      viewParam === "shared" ||
      viewParam === "expiring" ||
      viewParam === "all"
    ) {
      return viewParam;
    }
    return "all";
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebarOpen");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null
  >(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [showInsufficientFundsDialog, setShowInsufficientFundsDialog] =
    useState(false);
  const [insufficientFundsInfo, setInsufficientFundsInfo] = useState<{
    balance: number;
    requiredAmount: number;
  } | null>(null);
  const [insufficientFundsContext, setInsufficientFundsContext] = useState<{
    source: "upload" | "shared";
    sharedBlobId?: string;
    sharedShareId?: string | null;
  } | null>(null);

  // Close profile menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setShowProfileMenu(false);
    if (showProfileMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showProfileMenu]);

  // Check if returning from payment with intent to open upload dialog
  useEffect(() => {
    if (
      location.state?.openUploadDialog &&
      !uploadDialogFromPaymentRef.current
    ) {
      uploadDialogFromPaymentRef.current = true;
      setUploadDialogOpen(true);
    }
  }, [location.state?.openUploadDialog]);

  // Minimize sidebar when navigating to different pages on mobile
  useEffect(() => {
    // Close sidebar on navigation (better UX on mobile)
    const isMobile = window.innerWidth < 640; // sm breakpoint in Tailwind
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const handleLogout = () => {
    clearPrivateKey();
    authService.logout();
    window.location.href = "/";
  };

  // Load privateKey on mount if user is logged in but key is not loaded
  useEffect(() => {
    const loadPrivateKey = async () => {
      if (!user?.id || privateKey) return; // Skip if no user or key already loaded

      try {
        const res = await fetch(apiUrl(`/api/auth/profile?userId=${user.id}`));
        if (res.ok) {
          const data = await res.json();
          if (data.privateKey) {
            setPrivateKey(data.privateKey);
          }
        }
      } catch (err) {
        console.warn("Could not load encryption key:", err);
      }
    };
    loadPrivateKey();
  }, [user?.id, privateKey, setPrivateKey]);

  const loadFolders = async () => {
    if (!user?.id) {
      setFolders([]);
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/folders?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders);
      }
    } catch (err) {
      console.error("Failed to fetch folders:", err);
    }
  };

  // Reusable function to load files from server
  const loadFiles = async () => {
    if (!user?.id) {
      setUploadedFiles([]);
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/cache?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        const files: CachedFile[] = data.files.map((f: any) => ({
          blobId: f.blobId,
          name: f.filename,
          size: f.originalSize,
          type: f.contentType || "application/octet-stream",
          encrypted: f.encrypted,
          uploadedAt: f.uploadedAt,
          epochs: f.epochs || 3,
          status: f.status,
          s3Key: f.s3Key,
          folderId: f.folderId || null,
          folderPath: f.folderPath || null,
          starred: f.starred || false,
        }));

        // Deduplicate by blobId - keep server version as source of truth
        const deduped = Array.from(
          new Map(files.map((f: CachedFile) => [f.blobId, f])).values(),
        );
        setUploadedFiles(deduped);
      }
    } catch (err) {
      // Silently fail during server downtime
    }
  };

  // Load shared files
  const loadSharedFiles = async () => {
    if (!user?.id) {
      setSharedFiles([]);
      return;
    }
    try {
      const res = await fetch(apiUrl(`/api/shares/user?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        setSharedFiles(data.shares || []);
      }
    } catch (err) {
      // Silently fail during server downtime
    }
  };

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  // Load files from server on mount and when user changes
  useEffect(() => {
    loadFiles();
    loadSharedFiles();
    loadFolders();

    const visibilityHandler = () => {
      if (!document.hidden) {
        loadFiles();
        loadSharedFiles();
        loadFolders();
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      if (!document.hidden) {
        loadFiles();
      }
    }, 30000); // 30 seconds - reduced frequency to prevent CPU exhaustion

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visibilityHandler);
    };
  }, [user?.id]);

  // If navigation included a request to open upload picker (via state) or an explicit upload route, open upload dialog
  useEffect(() => {
    const state = (location.state as any) || {};

    if (state.openUploadPicker) {
      // If caller requested an immediate picker, open the upload dialog
      setUploadDialogOpen(true);
      // Also dispatch the upload-picker event for components that prefer direct file input
      window.dispatchEvent(new Event("open-upload-picker"));
      // Clear the state so it doesn't re-open on future navigations
      navigate(location.pathname + window.location.search, {
        replace: true,
        state: {},
      });
      return;
    }

    // If returning from payment page with openUploadAfterPayment flag
    if (state.openUploadAfterPayment) {
      setUploadDialogOpen(true);
      // Clear the state so it doesn't re-open on future navigations
      navigate(location.pathname + window.location.search, {
        replace: true,
        state: {},
      });
      return;
    }

    // Check sessionStorage for flag set by Payment page
    const openUploadAfterPayment = sessionStorage.getItem(
      "openUploadAfterPayment",
    );
    if (openUploadAfterPayment === "true") {
      setUploadDialogOpen(true);
      sessionStorage.removeItem("openUploadAfterPayment");
      return;
    }

    // Support navigation to /home/upload to explicitly open the upload dialog
    if (location.pathname.endsWith("/upload")) {
      setUploadDialogOpen(true);
      // Replace URL back to /home to avoid leaving the upload path in history
      navigate("/home" + window.location.search, { replace: true });
    }
  }, [location, navigate]);

  const handleFileUploaded = (file: {
    blobId: string;
    file: File;
    encrypted: boolean;
    epochs?: number;
  }) => {
    // Refresh from server instead of adding locally to avoid duplicates
    loadFiles();
  };

  const handleFileDeleted = async (blobId?: string) => {
    // Optimistic update: if blobId provided, remove immediately from UI
    if (blobId) {
      setUploadedFiles((prev) => prev.filter((f) => f.blobId !== blobId));
    }
    // Then refresh from server to sync any other changes
    await Promise.all([loadFiles(), loadSharedFiles()]);
  };

  useEffect(() => {
    const handleLazyUpload = (e: CustomEvent) => {
      const file = e.detail;
      // Add to cache for persistence across sessions
      addCachedFile(file);
      setUploadedFiles((prev) => [file, ...prev]);
    };
    window.addEventListener(
      "lazy-upload-finished",
      handleLazyUpload as EventListener,
    );
    return () =>
      window.removeEventListener(
        "lazy-upload-finished",
        handleLazyUpload as EventListener,
      );
  }, []);

  // Convert CachedFile to FileItem format for FolderCardView
  const fileItems = useMemo(() => {
    let filtered = uploadedFiles;

    // Apply view filters and sorting
    if (currentView === "recents") {
      // Get 10 most recently uploaded files, sorted by most recent first
      filtered = [...uploadedFiles]
        .sort(
          (a, b) =>
            new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
        )
        .slice(0, 10);
    } else if (currentView === "favorites") {
      // Filter for starred files only
      filtered = uploadedFiles.filter((f) => f.starred === true);
    } else if (currentView === "expiring") {
      // Files with 10 days or less remaining, sorted by closest to expiring first
      filtered = uploadedFiles
        .filter((f) => {
          const uploadDate = new Date(f.uploadedAt);
          const daysPerEpoch = 14;
          const totalDays = (f.epochs || 3) * daysPerEpoch;
          const expiryDate = new Date(
            uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000,
          );
          const now = new Date();
          const daysRemaining = Math.ceil(
            (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
          );
          return daysRemaining <= 10 && daysRemaining > 0;
        })
        .sort((a, b) => {
          // Calculate days remaining for each
          const calcDaysRemaining = (f: CachedFile) => {
            const uploadDate = new Date(f.uploadedAt);
            const daysPerEpoch = 14;
            const totalDays = (f.epochs || 3) * daysPerEpoch;
            const expiryDate = new Date(
              uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000,
            );
            const now = new Date();
            return Math.ceil(
              (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
            );
          };
          return calcDaysRemaining(a) - calcDaysRemaining(b); // Ascending: closest to expiring first
        });
    } else if (currentView === "shared") {
      // Show files that have active shares, sorted by share expiry (closest first)
      const sharedBlobIds = new Set(sharedFiles.map((s) => s.blobId));
      const sharedMap = new Map(sharedFiles.map((s) => [s.blobId, s]));

      filtered = uploadedFiles
        .filter((f) => sharedBlobIds.has(f.blobId))
        .sort((a, b) => {
          const shareA = sharedMap.get(a.blobId);
          const shareB = sharedMap.get(b.blobId);

          // If no expiry, put at end
          if (!shareA?.expiresAt && !shareB?.expiresAt) return 0;
          if (!shareA?.expiresAt) return 1;
          if (!shareB?.expiresAt) return -1;

          // Sort by expiry date ascending (closest to expiring first)
          const expiryA = new Date(shareA.expiresAt).getTime();
          const expiryB = new Date(shareB.expiresAt).getTime();
          return expiryA - expiryB;
        });
    } else if (selectedFolderId !== null) {
      // Filter by folder
      filtered = uploadedFiles.filter((f) => f.folderId === selectedFolderId);
    }

    return filtered.map((f) => ({
      blobId: f.blobId,
      name: f.name,
      size: f.size,
      type: f.type,
      encrypted: f.encrypted,
      uploadedAt: f.uploadedAt,
      epochs: f.epochs,
      status: f.status,
      folderId: f.folderId || null,
      starred: f.starred || false,
    }));
  }, [uploadedFiles, currentView, selectedFolderId, sharedFiles]);

  const handleCreateFolder = (parentId: string | null) => {
    setCreateFolderParentId(parentId);
    setCreateFolderDialogOpen(true);
  };

  const handleFolderCreated = (newFolder?: {
    id: string;
    name: string;
    parentId: string | null;
    color: string | null;
  }) => {
    setFolderRefreshKey((prev) => prev + 1);
    setCreateFolderDialogOpen(false);

    // Optimistically add the new folder to state immediately
    if (newFolder) {
      const folderNode = {
        id: newFolder.id,
        name: newFolder.name,
        parentId: newFolder.parentId,
        color: newFolder.color,
        fileCount: 0,
        childCount: 0,
        children: [],
      };

      setFolders((prev) => {
        // If it's a root folder, add directly
        if (newFolder.parentId === null) {
          const updated = [...prev, folderNode];
        }

        // Otherwise, find parent and add to its children
        const addToParent = (folderList: any[]): any[] => {
          return folderList.map((folder) => {
            if (folder.id === newFolder.parentId) {
              return {
                ...folder,
                children: [...folder.children, folderNode],
                childCount: folder.childCount + 1,
              };
            }
            if (folder.children.length > 0) {
              return {
                ...folder,
                children: addToParent(folder.children),
              };
            }
            return folder;
          });
        };

        const updated = addToParent(prev);
        return updated;
      });
    }

    // Delay refresh from server to allow optimistic update to render
    setTimeout(() => {
      loadFiles();
      loadFolders();
    }, 300);
  };

  const checkMinimumBalanceOrShowDialog = async (context?: {
    source: "upload" | "shared";
    sharedBlobId?: string;
    sharedShareId?: string | null;
  }) => {
    if (!user?.id) {
      return true;
    }

    try {
      const currentBalance = await getBalance(user.id);

      // Show insufficient funds dialog if balance is less than $0.01
      if (currentBalance < 0.01) {
        setInsufficientFundsContext(context || { source: "upload" });
        setInsufficientFundsInfo({
          balance: currentBalance,
          requiredAmount: 0.01,
        });
        setShowInsufficientFundsDialog(true);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Failed to check balance:", err);
      // On error, allow upload to proceed
      return true;
    }
  };

  const handleUploadClick = async () => {
    // Check minimum balance before opening upload dialog
    if (!user?.id) {
      setUploadDialogOpen(true);
      return;
    }

    const hasBalance = await checkMinimumBalanceOrShowDialog({
      source: "upload",
    });
    if (!hasBalance) return;

    setUploadDialogOpen(true);
  };

  const handleCloseUploadDialog = () => {
    setUploadDialogOpen(false);
  };

  const handleFileQueued = () => {
    // Just close the upload dialog - the toast will appear automatically
    setUploadDialogOpen(false);
  };

  const handleSingleFileUploadStarted = () => {
    // Close the upload dialog and redirect to the All Files view when a single file upload starts
    setUploadDialogOpen(false);
    setCurrentView("all");
  };

  // Close upload dialog when switching views
  useEffect(() => {
    if (uploadDialogOpen && currentView !== "all") {
      setUploadDialogOpen(false);
    }
  }, [currentView]);

  const handleFileMoved = async () => {
    await loadFiles(); // Refresh files after move
  };

  const handleFileMovedOptimistic = (
    blobIds: string[],
    newFolderId: string | null,
  ) => {
    // Update only the moved files' folder IDs without full refresh
    setUploadedFiles((prev) =>
      prev.map((f) =>
        blobIds.includes(f.blobId) ? { ...f, folderId: newFolderId } : f,
      ),
    );
  };

  const handleFilesDroppedToRoot = async (blobIds: string[]) => {
    // Move files to root (folderId = null) when dropped on "Your Storage"
    const user = authService.getCurrentUser();
    if (!user?.id) {
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/files/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          blobIds,
          folderId: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to move files");
      }
      // Update optimistically
      handleFileMovedOptimistic(blobIds, null);
    } catch (err) {
      console.error("Failed to move files to root:", err);
      // Fallback to full refresh on error
      await loadFiles();
    }
  };

  const handleFolderDroppedToRoot = async (folderIds: string[]) => {
    // Move folders to root (parentId = null) when dropped on "Your Storage"
    const user = authService.getCurrentUser();
    if (!user?.id) {
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/folders/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          folderIds,
          parentId: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to move folders");
      }

      // Update optimistically for each folder
      folderIds.forEach((folderId) => {
        handleFolderMovedOptimistic(folderId, null);
      });
    } catch (err) {
      console.error("Failed to move folders to root:", err);
      // Fallback to full refresh on error
      await loadFolders();
    }
  };

  const handleFilesDroppedToFolder = async (
    blobIds: string[],
    folderId: string,
  ) => {
    // Move files to specified folder when dropped on it
    const user = authService.getCurrentUser();
    if (!user?.id) {
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/files/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          blobIds,
          folderId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to move files");
      }

      // Update optimistically
      handleFileMovedOptimistic(blobIds, folderId);
    } catch (err) {
      console.error("Failed to move files to folder:", err);
      // Fallback to full refresh on error
      await loadFiles();
    }
  };

  const handleFolderDroppedToFolder = async (
    folderIds: string[],
    targetFolderId: string,
  ) => {
    // Move folders to specified folder when dropped on it
    const user = authService.getCurrentUser();
    if (!user?.id) {
      return;
    }

    // Don't allow dropping a folder onto itself or its children
    if (folderIds.includes(targetFolderId)) {
      console.warn(
        "[handleFolderDroppedToFolder] Cannot drop folder onto itself",
      );
      return;
    }

    try {
      const res = await fetch(apiUrl("/api/folders/move"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          folderIds,
          parentId: targetFolderId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to move folders");
      }

      // Update optimistically for each folder
      folderIds.forEach((folderId) => {
        handleFolderMovedOptimistic(folderId, targetFolderId);
      });
    } catch (err) {
      console.error("Failed to move folders:", err);
      // Fallback to full refresh on error
      loadFolders();
    }
  };

  const handleFolderMovedOptimistic = (
    folderIdToMove: string,
    newParentId: string | null,
  ) => {
    // Update folder structure optimistically without full refresh
    setFolders((prev) => {
      // Helper function to recursively update folder tree
      const updateFolderTree = (
        folderList: any[],
        movedFolder: any | null = null,
      ): { updated: any[]; found: any | null } => {
        const result: any[] = [];
        let foundFolder = movedFolder;

        for (const folder of folderList) {
          if (folder.id === folderIdToMove) {
            // Found the folder to move, store it but don't include in result
            foundFolder = { ...folder };
            continue;
          }

          // Recursively process children
          const { updated: updatedChildren, found } = updateFolderTree(
            folder.children,
            foundFolder,
          );
          foundFolder = found || foundFolder;

          result.push({
            ...folder,
            children: updatedChildren,
            childCount: updatedChildren.length,
          });
        }

        return { updated: result, found: foundFolder };
      };

      // First pass: remove folder from old location and find it
      const { updated: withoutMoved, found: movedFolder } =
        updateFolderTree(prev);

      if (!movedFolder) {
        console.warn("Folder to move not found:", folderIdToMove);
        return prev;
      }

      // Update the moved folder's parentId
      const updatedMovedFolder = {
        ...movedFolder,
        parentId: newParentId,
      };

      // Second pass: insert folder into new location
      const insertFolder = (folderList: any[]): any[] => {
        if (newParentId === null) {
          // Moving to root level
          return [...folderList, updatedMovedFolder];
        }

        return folderList.map((folder) => {
          if (folder.id === newParentId) {
            // Found target parent, add as child
            return {
              ...folder,
              children: [...folder.children, updatedMovedFolder],
              childCount: folder.children.length + 1,
            };
          }

          // Recursively check children
          return {
            ...folder,
            children: insertFolder(folder.children),
          };
        });
      };

      const result = insertFolder(withoutMoved);
      return result;
    });
  };

  const handleFolderDeleted = () => {
    setFolderRefreshKey((prev) => prev + 1);
    loadFiles(); // Refresh files
    loadFolders();
  };

  const handleSharedFilesRefresh = () => {
    loadSharedFiles(); // Refresh shared files list
  };

  return (
    <div className="main-app-container">
      <div className="flex min-h-screen">
        {/* Mini Sidebar - shown when main sidebar is hidden, always visible on mobile */}
        {!sidebarOpen && (
          <aside className="fixed left-0 top-0 bottom-0 z-20 w-12 sm:w-16 bg-black border-r border-zinc-800 flex flex-col items-center py-2 sm:py-4 gap-1 sm:gap-1.5">
            {/* Show sidebar button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
              title="Show sidebar"
            >
              <PanelLeft className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            <div className="h-px w-8 sm:w-10 bg-zinc-800 my-1 sm:my-1.5" />

            {/* Upload button */}
            <button
              onClick={handleUploadClick}
              className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
              title="Upload"
            >
              <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            {/* All Files / Your Storage */}
            <button
              onClick={() => {
                setCurrentView("all");
                setSelectedFolderId(null);
                navigate("/home?view=all");
              }}
              className={`p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${currentView === "all" && selectedFolderId === null ? "bg-teal-600/15 text-teal-400" : "text-gray-300 hover:text-white"}`}
              title="All Files"
            >
              <Home className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            {/* Views */}
            <button
              onClick={() => {
                setCurrentView("recents");
                setSelectedFolderId(null);
                navigate("/home?view=recents");
              }}
              className={`p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${currentView === "recents" ? "bg-teal-600/15 text-teal-400" : "text-gray-300 hover:text-white"}`}
              title="Recents"
            >
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            <button
              onClick={() => {
                setCurrentView("favorites");
                setSelectedFolderId(null);
                navigate("/home?view=favorites");
              }}
              className={`p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${currentView === "favorites" ? "bg-teal-600/15 text-teal-400" : "text-gray-300 hover:text-white"}`}
              title="Favorites"
            >
              <Star className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            <button
              onClick={() => {
                setCurrentView("shared");
                setSelectedFolderId(null);
                navigate("/home?view=shared");
              }}
              className={`p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${currentView === "shared" ? "bg-teal-600/15 text-teal-400" : "text-gray-300 hover:text-white"}`}
              title="Shared Files"
            >
              <Share2 className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            <button
              onClick={() => {
                setCurrentView("expiring");
                setSelectedFolderId(null);
                navigate("/home?view=expiring");
              }}
              className={`p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors ${currentView === "expiring" ? "bg-teal-600/15 text-teal-400" : "text-gray-300 hover:text-white"}`}
              title="Expiring Soon"
            >
              <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            <div className="h-px w-8 sm:w-10 bg-zinc-800 my-1 sm:my-1.5" />

            {/* Add folder button */}
            <button
              onClick={() => handleCreateFolder(selectedFolderId)}
              className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
              title="Create folder"
            >
              <FolderPlus className="h-3 w-3 sm:h-4 sm:w-4" />
            </button>

            {/* Folder icons (scrollable if many) */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden w-full flex flex-col items-center gap-1 px-1 sm:px-2">
              {/* Folders will be rendered here as icons only */}
            </div>

            {/* User icon at bottom */}
            <div className="h-px w-8 sm:w-10 bg-zinc-800 my-1 sm:my-1.5" />
            <div className="relative w-full flex justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProfileMenu(!showProfileMenu);
                }}
                className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
                title="Profile"
              >
                <User className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>

              {/* Profile Dropdown Menu */}
              {showProfileMenu && (
                <div
                  className="absolute bottom-full left-full ml-2 mb-0 bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 py-2 z-50 min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProfileMenu(false);
                      navigate("/profile");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-800 text-gray-300 text-left transition-colors"
                  >
                    <User className="h-4 w-4" />
                    <span>Profile</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProfileMenu(false);
                      navigate("/payment");
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-zinc-800 text-gray-300 text-left transition-colors"
                  >
                    <Wallet className="h-4 w-4" />
                    <span>Wallet</span>
                  </button>
                  <div className="h-px bg-zinc-800 my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowProfileMenu(false);
                      handleLogout();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-400 hover:bg-red-950/20 hover:text-red-300 text-left transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Folder Sidebar - fixed to viewport so it scrolls independently */}
        <aside
          className={`fixed left-0 top-0 bottom-0 z-20 ${sidebarOpen ? "w-full sm:w-64" : "w-0"} transition-all duration-300 overflow-hidden main-sidebar flex-shrink-0 flex flex-col`}
        >
          <div className="w-full sm:w-64 h-screen flex flex-col overflow-hidden main-sidebar-content">
            <div className="flex-1 overflow-y-auto overscroll-none main-scrollbar">
              <FolderTree
                selectedFolderId={selectedFolderId}
                onSelectFolder={(id) => {
                  setSelectedFolderId(id);
                  if (id !== null) setCurrentView("all");
                }}
                onCreateFolder={handleCreateFolder}
                onRefresh={loadFolders}
                folders={folders}
                key={folderRefreshKey}
                onUploadClick={handleUploadClick}
                onSelectView={(view) => {
                  setCurrentView(view);
                  setSelectedFolderId(null);
                  // Close upload dialog when switching views
                  setUploadDialogOpen(false);
                }}
                currentView={currentView}
                onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                onFilesDroppedToRoot={handleFilesDroppedToRoot}
                onFilesDroppedToFolder={handleFilesDroppedToFolder}
                onFolderDroppedToRoot={handleFolderDroppedToRoot}
                onFolderDroppedToFolder={handleFolderDroppedToFolder}
              />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={`flex-1 px-4 pt-16 pb-8 sm:px-6 lg:px-8 overflow-auto main-content main-scrollbar transition-all ${sidebarOpen ? "ml-0 sm:ml-64" : "ml-12 sm:ml-16"}`}
        >
          {/* Sidebar toggle button when sidebar is hidden - REMOVED, now in mini sidebar */}

          {/* Unified Folder/File View */}
          <FolderCardView
            files={fileItems}
            folders={folders}
            currentFolderId={selectedFolderId}
            onFolderChange={setSelectedFolderId}
            onFileDeleted={handleFileDeleted}
            onFileMoved={handleFileMoved}
            onFileMovedOptimistic={handleFileMovedOptimistic}
            onFolderDeleted={handleFolderDeleted}
            onFolderCreated={handleFolderCreated}
            onFolderMovedOptimistic={handleFolderMovedOptimistic}
            onUploadClick={handleUploadClick}
            currentView={currentView}
            sharedFiles={sharedFiles}
            onSharedFilesRefresh={handleSharedFilesRefresh}
            folderRefreshKey={folderRefreshKey}
            onCheckBalanceForSharedUpload={({ blobId, shareId }) =>
              checkMinimumBalanceOrShowDialog({
                source: "shared",
                sharedBlobId: blobId,
                sharedShareId: shareId,
              })
            }
            onStarToggle={(blobId, starred) => {
              setUploadedFiles((prev) =>
                prev.map((f) => (f.blobId === blobId ? { ...f, starred } : f)),
              );
            }}
          />
        </main>
      </div>

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentId={createFolderParentId}
        onFolderCreated={handleFolderCreated}
      />

      {/* Upload Files Dialog - Pop-up */}
      <Dialog open={uploadDialogOpen} onOpenChange={handleCloseUploadDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overscroll-none bg-slate-900 border-slate-800">
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={handleCloseUploadDialog}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-6">
            <UploadSection
              onUploaded={handleFileUploaded}
              onSingleFileUploadStarted={handleSingleFileUploadStarted}
              epochs={epochs}
              onEpochsChange={setEpochs}
              onFileQueued={handleFileQueued}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Toast - Bottom Right Popup */}
      <UploadToast />

      {/* Insufficient Funds Dialog */}
      {insufficientFundsInfo && (
        <InsufficientFundsDialog
          open={showInsufficientFundsDialog}
          onOpenChange={setShowInsufficientFundsDialog}
          currentBalance={insufficientFundsInfo.balance}
          requiredAmount={insufficientFundsInfo.requiredAmount}
          onAddFunds={() => {
            setShowInsufficientFundsDialog(false);
            if (insufficientFundsContext?.source === "shared") {
              sessionStorage.setItem(
                "pendingSharedSave",
                JSON.stringify({
                  blobId: insufficientFundsContext.sharedBlobId,
                  shareId: insufficientFundsContext.sharedShareId || null,
                }),
              );
            } else {
              // Set flag in sessionStorage so upload dialog opens when returning from payment
              sessionStorage.setItem("openUploadAfterPayment", "true");
            }
            navigate("/payment");
          }}
        />
      )}
    </div>
  );
}
