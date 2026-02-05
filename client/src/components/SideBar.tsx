import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Trash2,
  Home,
  Upload,
  Clock,
  Share2,
  AlertTriangle,
  ListTodo,
  User,
  DollarSign,
  Wallet,
  LogOut,
  PanelLeftClose,
  Star,
} from "lucide-react";
import { Button } from "./ui/button";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { apiUrl } from "../config/api";
import { getBalance } from "../services/balanceService";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  childCount: number;
  children: FolderNode[];
};

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRefresh?: () => void;
  onUploadClick?: () => void;
  folders?: FolderNode[]; // Add folders prop
  onSelectView?: (
    view:
      | "all"
      | "recents"
      | "shared"
      | "expiring"
      | "favorites"
      | "upload-queue",
  ) => void;
  currentView?:
    | "all"
    | "recents"
    | "shared"
    | "expiring"
    | "favorites"
    | "upload-queue";
  onToggleSidebar?: () => void;
  onFilesDroppedToRoot?: (blobIds: string[]) => void;
  onFilesDroppedToFolder?: (blobIds: string[], folderId: string) => void;
  onFolderDroppedToRoot?: (folderIds: string[]) => void;
  onFolderDroppedToFolder?: (
    folderIds: string[],
    targetFolderId: string,
  ) => void;
}

export default function FolderTree({
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRefresh,
  onUploadClick,
  folders: propFolders,
  onSelectView,
  currentView,
  onToggleSidebar,
  onFilesDroppedToRoot,
  onFilesDroppedToFolder,
  onFolderDroppedToRoot,
  onFolderDroppedToFolder,
}: FolderTreeProps) {
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [dragOverRoot, setDragOverRoot] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const { clearPrivateKey } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const user = authService.getCurrentUser();
  const userId = user?.id ?? null;

  // Folder delete modal state
  const [folderDeleteOpen, setFolderDeleteOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Fetch balance
  useEffect(() => {
    const fetchBalance = async (force = false) => {
      if (!userId || document.hidden) return;
      try {
        const balance = await getBalance(userId, { force });
        setBalance(balance || 0);
      } catch (err) {
        // Silently fail
      }
    };

    if (userId) {
      // Initial fetch
      fetchBalance();

      // Listen for balance update events (triggered after uploads/payments)
      const balanceUpdateHandler = () => {
        fetchBalance(true);
      };
      window.addEventListener("balance-updated", balanceUpdateHandler);

      const visibilityHandler = () => {
        if (!document.hidden) fetchBalance(true);
      };
      document.addEventListener("visibilitychange", visibilityHandler);

      // Fallback: poll every 60 seconds for changes
      const interval = window.setInterval(() => {
        if (!document.hidden) fetchBalance();
      }, 60000);

      return () => {
        clearInterval(interval);
        window.removeEventListener("balance-updated", balanceUpdateHandler);
        document.removeEventListener("visibilitychange", visibilityHandler);
      };
    }
  }, [userId]);

  const handleLogout = () => {
    clearPrivateKey();
    authService.logout();
    window.location.href = "/";
  };

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

  // Use prop folders if provided, otherwise fetch
  useEffect(() => {
    if (propFolders) {
      setFolders(propFolders);
      setLoading(false);
    } else {
      fetchFolders();
    }
  }, [propFolders, fetchFolders]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Allow parent to trigger refresh (only when sidebar manages its own data)
  useEffect(() => {
    if (onRefresh && !propFolders) {
      fetchFolders();
    }
  }, [onRefresh, propFolders, fetchFolders]);

  const handleRootDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverRoot(true);
  };

  const handleRootDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    // Only leave if we're actually leaving the element
    if (e.currentTarget === e.target) {
      setDragOverRoot(false);
    }
  };

  const handleRootDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverRoot(false);

    // Extract file IDs from the drag data
    // Try both application/json and application/x-walrus-file formats
    let fileData = e.dataTransfer.getData("application/json");
    if (!fileData) {
      fileData = e.dataTransfer.getData("application/x-walrus-file");
    }

    let folderData = e.dataTransfer.getData("application/x-walrus-folder");

    // Handle file drops
    if (fileData) {
      try {
        const parsed = JSON.parse(fileData);
        const blobIds = parsed.blobIds || [];
        if (Array.isArray(blobIds) && blobIds.length > 0) {
          onFilesDroppedToRoot?.(blobIds);
        }
      } catch (err) {
        console.error("Failed to parse file drag data:", err);
      }
    }

    // Handle folder drops
    if (folderData) {
      try {
        const parsed = JSON.parse(folderData);
        const folderIds = parsed.folderIds || [];
        if (Array.isArray(folderIds) && folderIds.length > 0) {
          onFolderDroppedToRoot?.(folderIds);
        }
      } catch (err) {
        console.error("Failed to parse folder drag data:", err);
      }
    }
  };

  const handleFolderDragOver = (folderId: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolderId(folderId);
  };

  const handleFolderDragLeave = (folderId: string, e: React.DragEvent) => {
    if (dragOverFolderId === folderId) {
      setDragOverFolderId(null);
    }
  };

  const handleFolderDrop = (folderId: string, e: React.DragEvent) => {

    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderId(null);

    // Extract file IDs and folder IDs from the drag data
    let fileData = e.dataTransfer.getData("application/json");
    if (!fileData) {
      fileData = e.dataTransfer.getData("application/x-walrus-file");
    }

    let folderData = e.dataTransfer.getData("application/x-walrus-folder");

    // Handle file drops
    if (fileData) {
      try {
        const parsed = JSON.parse(fileData);
        const blobIds = parsed.blobIds || [];
        if (Array.isArray(blobIds) && blobIds.length > 0) {
          onFilesDroppedToFolder?.(blobIds, folderId);
        }
      } catch (err) {
        console.error("Failed to parse file drag data:", err);
      }
    }

    // Handle folder drops
    if (folderData) {
      try {
        const parsed = JSON.parse(folderData);
        const folderIds = parsed.folderIds || [];
        if (Array.isArray(folderIds) && folderIds.length > 0) {
          onFolderDroppedToFolder?.(folderIds, folderId);
        }
      } catch (err) {
        console.error("Failed to parse folder drag data:", err);
      }
    }
  };

  const toggleExpand = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleRename = async (folderId: string) => {
    const user = authService.getCurrentUser();
    if (!user?.id || !editingName.trim()) return;

    try {
      const res = await fetch(apiUrl(`/api/folders/${folderId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: editingName.trim() }),
      });

      if (res.ok) {
        if (propFolders) {
          onRefresh?.();
        } else {
          fetchFolders();
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to rename folder");
      }
    } catch (err) {
      console.error("Failed to rename folder:", err);
    } finally {
      setEditingId(null);
      setEditingName("");
    }
  };

  const handleDelete = async (folderId: string) => {
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
        if (selectedFolderId === folderId) {
          onSelectFolder(null);
        }
        if (propFolders) {
          onRefresh?.();
        } else {
          fetchFolders();
        }
      } else {
        const data = await res.json();
        alert(data.error || "Failed to delete folder");
      }
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  };

  const renderFolder = (folder: FolderNode, depth: number = 0) => {
    const isExpanded = expandedIds.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const isHovered = dragOverFolderId === folder.id;
    const hasChildren = folder.children.length > 0;
    const FolderIcon = isExpanded ? FolderOpen : Folder;

    return (
      <div key={folder.id}>
        <div
          className={`
            group flex items-center gap-1 py-0.5 rounded-md cursor-pointer transition-colors text-gray-300
            ${isSelected ? "bg-teal-600/15 text-teal-400" : isHovered ? "bg-teal-600/20 border border-teal-500/50" : "hover:bg-zinc-800"}
          `}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => onSelectFolder(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
          }}
          onDragOver={(e) => handleFolderDragOver(folder.id, e)}
          onDragLeave={(e) => handleFolderDragLeave(folder.id, e)}
          onDrop={(e) => handleFolderDrop(folder.id, e)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => toggleExpand(folder.id, e)}
              className="p-0.5 hover:bg-zinc-700 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-400" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}

          <FolderIcon
            className="h-4 w-4 shrink-0"
            style={{ color: folder.color || "#60a5fa" }}
          />

          {editingId === folder.id ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleRename(folder.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename(folder.id);
                if (e.key === "Escape") {
                  setEditingId(null);
                  setEditingName("");
                }
              }}
              className="flex-1 bg-transparent border-b border-teal-600 outline-none text-sm px-1 text-gray-300"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 text-sm truncate">{folder.name}</span>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              setContextMenu({
                folderId: folder.id,
                x: e.clientX,
                y: e.clientY,
              });
            }}
            className="opacity-0 group-hover:opacity-100 h-7 w-7 p-1 hover:bg-zinc-700 rounded transition-opacity flex items-center justify-center"
          >
            <MoreHorizontal className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {folder.children.map((child) => renderFolder(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu]);

  // Close profile menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setShowProfileMenu(false);
    if (showProfileMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showProfileMenu]);

  // Custom scroll rail/thumb (visible even when OS hides native scrollbar)
  const scrollInnerRef = useRef<HTMLDivElement | null>(null);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);
  const [showRail, setShowRail] = useState(false);

  useEffect(() => {
    const el = scrollInnerRef.current;
    if (!el) return;

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight) {
        setThumbHeight(0);
        return;
      }
      const h = Math.max((clientHeight / scrollHeight) * clientHeight, 24);
      const top =
        (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - h);
      setThumbHeight(h);
      setThumbTop(isFinite(top) ? top : 0);
    };

    update();

    el.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [folders]);

  return (
    <div className="relative flex flex-col h-full px-4 pt-3">
      {/* Logo */}
      <div className="flex flex-col py-2">
        <div className="flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="flex items-center gap-3"
          >
            <img
              src="/logo+text.svg"
              alt="Walrus Logo"
              className="h-10 w-auto"
            />
          </a>
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-gray-300 hover:text-white"
              title="Hide sidebar"
            >
              <PanelLeftClose className="h-5 w-5" />
            </button>
          )}
        </div>
        {onUploadClick && (
          <div className="w-full mt-4">
            <Button
              onClick={() => {
                const path = window.location.pathname;
                if (!onUploadClick) return;
                if (path === "/" || path.startsWith("/home")) {
                  onUploadClick();
                } else {
                  // Navigate to a dedicated upload route so Home opens the upload dialog
                  navigate("/home/upload");
                }
              }}
              className="upload-button-main w-full gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable Folder List */}
      <div
        className={`flex-1 min-h-0 flex overflow-hidden ${thumbHeight > 0 ? "-mr-5" : ""}`}
      >
        <div className="flex-1 min-w-0 overflow-hidden">
          <div
            className="h-full overflow-y-auto overflow-x-hidden overscroll-none sidebar-scrollable scrollbar-thin"
            ref={scrollInnerRef}
            onMouseEnter={(e) => {
              e.currentTarget.classList.add("scrollbar-visible");
            }}
            onMouseLeave={(e) => {
              e.currentTarget.classList.remove("scrollbar-visible");
            }}
          >
            <div
              className={`sidebar-scroll-content ${thumbHeight > 0 ? "pr-4" : ""}`}
            >
              {/* Special Views */}
              {onSelectView && (
                <>
                  <div
                    className={`
                flex items-center gap-2 pl-2 py-1.5 cursor-pointer transition-all rounded-md text-gray-300
                ${
                  selectedFolderId === null && currentView === "all"
                    ? "bg-teal-600/15 text-teal-400"
                    : dragOverRoot
                      ? "bg-teal-600/20 border border-teal-500/50"
                      : "hover:bg-zinc-800"
                }
              `}
                    onClick={() => {
                      navigate("/home?view=all");
                      onSelectFolder(null);
                      onSelectView?.("all");
                    }}
                    onDragOver={handleRootDragOver}
                    onDragLeave={handleRootDragLeave}
                    onDrop={handleRootDrop}
                  >
                    <Home
                      className={`h-4 w-4 ${selectedFolderId === null && currentView === "all" ? "text-teal-400" : "text-gray-400"}`}
                    />
                    <span className="text-[15px] font-medium">
                      Your Storage
                    </span>
                  </div>
                  <div className="h-px bg-zinc-800 ml-2 my-2" />
                  <div
                    className={`
                flex items-center gap-2 pl-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "recents" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md"
                    : "hover:bg-zinc-800"
                }
              `}
                    onClick={() => {
                      navigate("/home?view=recents");
                      onSelectView("recents");
                      onSelectFolder(null);
                    }}
                  >
                    <Clock
                      className={`h-4 w-4 ${currentView === "recents" && selectedFolderId === null ? "text-teal-400" : "text-gray-400"}`}
                    />
                    <span className="text-[15px]">Recents</span>
                  </div>
                  <div
                    className={`
                flex items-center gap-2 pl-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "favorites" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md"
                    : "hover:bg-zinc-800"
                }
              `}
                    onClick={() => {
                      navigate("/home?view=favorites");
                      onSelectView("favorites");
                      onSelectFolder(null);
                    }}
                  >
                    <Star className="h-4 w-4 text-gray-400" />
                    <span className="text-[15px]">Favorites</span>
                  </div>
                  <div
                    className={`
                flex items-center gap-2 pl-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "shared" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md"
                    : "hover:bg-zinc-800"
                }
              `}
                    onClick={() => {
                      navigate("/home?view=shared");
                      onSelectView("shared");
                      onSelectFolder(null);
                    }}
                  >
                    <Share2
                      className={`h-4 w-4 ${currentView === "shared" && selectedFolderId === null ? "text-teal-400" : "text-gray-400"}`}
                    />
                    <span className="text-[15px]">Shared Files</span>
                  </div>
                  <div
                    className={`
                flex items-center gap-2 pl-3 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "expiring" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md"
                    : "hover:bg-zinc-800"
                }
              `}
                    onClick={() => {
                      navigate("/home?view=expiring");
                      onSelectView("expiring");
                      onSelectFolder(null);
                    }}
                  >
                    <AlertTriangle
                      className={`h-4 w-4 ${currentView === "expiring" && selectedFolderId === null ? "text-teal-400" : "text-gray-400"}`}
                    />
                    <span className="text-[15px]">Expiring Soon</span>
                  </div>
                  <div className="h-px bg-zinc-800 ml-2 my-2" />
                  {/* Folders header moved here (below separator) */}
                  <div className="flex items-center justify-between pl-2 py-1">
                    <span className="text-[15px] font-medium text-gray-300">
                      Folders
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCreateFolder(selectedFolderId)}
                      className="h-6 w-6 p-0.5 rounded text-gray-300 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Create folder"
                    >
                      <FolderPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}

              {/* Root (All Files) moved above */}

              {/* Folder Tree */}
              <div className="py-1">
                {folders.map((folder) => renderFolder(folder))}
              </div>

              {folders.length === 0 && (
                <div className="px-2 py-4 text-center text-sm text-gray-400">
                  No folders yet.
                </div>
              )}

              {/* ...existing code... */}
            </div>
          </div>
        </div>
        <div
          className={`relative flex-shrink-0 ${thumbHeight > 0 ? "w-5 -mr-5" : "w-0"}`}
        >
          <div className="custom-scroll-rail visible" aria-hidden>
            {thumbHeight > 0 && (
              <div
                className="custom-scroll-thumb"
                style={{
                  height: `${thumbHeight}px`,
                  transform: `translateY(${thumbTop}px)`,
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* User Profile Section - keep visible and pinned to the bottom */}
      {user && (
        <div className="sticky bottom-0 z-10 border-t border-zinc-800 bg-black">
          <div
            className="flex items-center gap-3 px-2 py-2 cursor-pointer hover:bg-zinc-800 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowProfileMenu(!showProfileMenu);
            }}
          >
            {/* Profile Picture */}
            <div className="h-10 w-10 rounded-full profile-pic-bg flex items-center justify-center flex-shrink-0">
              <User className="h-5 w-5 text-white" />
            </div>

            {/* Username and Balance */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">
                {user.username}
              </div>
              <div className="text-xs text-gray-400 flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                {balance !== null ? balance.toFixed(2) : "..."}
              </div>
            </div>

            {/* Click Menu */}
            {showProfileMenu && (
              <div
                className="absolute bottom-full left-0 w-full mb-1 bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 py-2 z-50"
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
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-destructive hover:bg-destructive-20 hover:text-destructive dark:text-destructive-foreground text-left transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context Menu - rendered via portal to avoid z-index issues */}
      {contextMenu &&
        typeof window !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop to close menu */}
            <div
              className="fixed inset-0 z-[9998]"
              style={{ backgroundColor: "transparent" }}
              onClick={() => setContextMenu(null)}
            />
            <div
              className="fixed z-[9999] bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 py-1.5 px-2 min-w-[140px]"
              style={{
                top: `${contextMenu.y}px`,
                left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 190))}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-zinc-800 text-gray-300 text-left"
                onClick={() => {
                  const folder =
                    folders.find((f) => f.id === contextMenu.folderId) ||
                    folders
                      .flatMap((f) => f.children)
                      .find((f) => f.id === contextMenu.folderId);
                  if (folder) {
                    setEditingId(folder.id);
                    setEditingName(folder.name);
                  }
                  setContextMenu(null);
                }}
              >
                <Pencil className="h-3 w-3" />
                Rename
              </button>
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-zinc-800 text-gray-300 text-left"
                onClick={() => {
                  onCreateFolder(contextMenu.folderId);
                  setContextMenu(null);
                }}
              >
                <FolderPlus className="h-3 w-3" />
                New subfolder
              </button>
              <hr className="my-1 border-zinc-800" />
              <button
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-destructive-20 text-destructive text-left"
                onClick={() => {
                  const folder =
                    folders.find((f) => f.id === contextMenu.folderId) ||
                    folders
                      .flatMap((f) => f.children)
                      .find((f) => f.id === contextMenu.folderId);
                  setFolderToDelete(
                    folder
                      ? { id: folder.id, name: folder.name }
                      : { id: contextMenu.folderId, name: "" },
                  );
                  setFolderDeleteOpen(true);
                  setContextMenu(null);
                }}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}

      <DeleteConfirmDialog
        open={folderDeleteOpen}
        onOpenChange={(open) => {
          setFolderDeleteOpen(open);
          if (!open) setFolderToDelete(null);
        }}
        fileName={folderToDelete?.name ?? ""}
        title={"Delete folder?"}
        description={
          "This will permanently delete the folder. Files inside will be moved to the root."
        }
        note={"You can move files before deleting if needed."}
        onConfirm={() => {
          if (!folderToDelete) return;
          handleDelete(folderToDelete.id);
          setFolderToDelete(null);
        }}
      />
    </div>
  );
}
