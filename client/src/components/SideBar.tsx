import { useState, useCallback, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "./ui/button";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  fileCount: number;
  childCount: number;
  children: FolderNode[];
};

interface FolderTreeProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onRefresh?: () => void;
  onUploadClick?: () => void;
  onSelectView?: (
    view: "all" | "recents" | "shared" | "expiring" | "upload-queue",
  ) => void;
  currentView?: "all" | "recents" | "shared" | "expiring" | "upload-queue";
}

export default function FolderTree({
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onRefresh,
  onUploadClick,
  onSelectView,
  currentView,
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
  const { items: uploadQueueItems, refresh: refreshUploadQueue } =
    useUploadQueue();
  const { clearPrivateKey } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<number | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const user = authService.getCurrentUser();

  // Listen for upload queue updates to refresh the count immediately
  useEffect(() => {
    const handler = () => {
      refreshUploadQueue();
    };
    window.addEventListener("upload-queue-updated", handler);
    return () => window.removeEventListener("upload-queue-updated", handler);
  }, [refreshUploadQueue]);

  // Fetch balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!user?.id) return;
      try {
        const response = await fetch(
          apiUrl(`/api/payment/get-balance?userId=${user.id}`),
        );
        if (!response.ok) return;
        const data = await response.json();
        if (response.ok) {
          setBalance(data.balance || 0);
        }
      } catch (err) {
        // Silently fail
      }
    };

    if (user) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 60000); // 60 seconds
      return () => clearInterval(interval);
    }
  }, [user]);

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

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Allow parent to trigger refresh
  useEffect(() => {
    if (onRefresh) {
      fetchFolders();
    }
  }, [onRefresh, fetchFolders]);

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
        fetchFolders();
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

    if (!confirm("Delete this folder? Files inside will be moved to the root."))
      return;

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
        fetchFolders();
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
    const hasChildren = folder.children.length > 0;
    const FolderIcon = isExpanded ? FolderOpen : Folder;

    return (
      <div key={folder.id}>
        <div
          className={`
            group flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-gray-300
            ${isSelected ? "bg-teal-600/15 text-teal-400" : "hover:bg-zinc-800"}
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => onSelectFolder(folder.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ folderId: folder.id, x: e.clientX, y: e.clientY });
          }}
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

          {folder.fileCount > 0 && (
            <span className="text-xs text-gray-400">{folder.fileCount}</span>
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
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-opacity"
          >
            <MoreHorizontal className="h-3 w-3 text-gray-400" />
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

  return (
    <div className="relative flex flex-col h-full pl-6 pr-6 pt-6">
      {/* Logo */}
      <div className="flex flex-col px-3 py-3">
        <a
          href="/"
          onClick={(e) => {
            e.stopPropagation();
          }}
          className="flex items-center gap-3"
        >
          <img src="/logo+text.svg" alt="Walrus Logo" className="h-10 w-auto" />
        </a>
        {onUploadClick && (
          <div className="w-full mt-8">
            <Button
              onClick={onUploadClick}
              className="upload-button-main w-full flex items-center justify-center gap-2 text-white bg-emerald-700 hover:bg-emerald-600 rounded-md"
            >
              <Upload className="h-4 w-4" />
              Upload
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable Folder List */}
      <div className="flex-1 overflow-y-auto overscroll-none scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-gray-400 dark:hover:scrollbar-thumb-slate-500">
        {/* Special Views */}
        {onSelectView && (
          <>
            <div
              className={`
                flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  selectedFolderId === null && currentView === "all"
                    ? "bg-teal-600/15 text-teal-400 rounded-md mx-2"
                    : "hover:bg-zinc-800"
                }
              `}
              onClick={() => {
                navigate("/home?view=all");
                onSelectFolder(null);
                onSelectView?.("all");
              }}
            >
              <Home
                className={`h-4 w-4 ${selectedFolderId === null && currentView === "all" ? "text-teal-400" : "text-gray-400"}`}
              />
              <span className="text-sm">Your Storage</span>
            </div>
            <div className="h-px bg-zinc-800 mx-3 my-2" />
            <div
              className={`
                flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "upload-queue" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md mx-2"
                    : "hover:bg-zinc-800"
                }
              `}
              onClick={() => {
                navigate("/home?view=upload-queue");
                onSelectView("upload-queue");
                onSelectFolder(null);
              }}
            >
              <ListTodo
                className={`h-4 w-4 ${currentView === "upload-queue" && selectedFolderId === null ? "text-teal-400" : "text-gray-400"}`}
              />
              <span className="text-sm">Upload Queue</span>
              {uploadQueueItems.filter((item) => item.status !== "done")
                .length > 0 && (
                <span className="ml-auto text-xs bg-teal-600 text-white px-1.5 py-0.5 rounded-full">
                  {
                    uploadQueueItems.filter((item) => item.status !== "done")
                      .length
                  }
                </span>
              )}
            </div>
            <div
              className={`
                flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "recents" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md mx-2"
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
              <span className="text-sm">Recents</span>
            </div>
            <div
              className={`
                flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "shared" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md mx-2"
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
              <span className="text-sm">Shared Files</span>
            </div>
            <div
              className={`
                flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors text-gray-300
                ${
                  currentView === "expiring" && selectedFolderId === null
                    ? "bg-teal-600/15 text-teal-400 rounded-md mx-2"
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
                className={`h-4 w-4 ${currentView === "expiring" && selectedFolderId === null ? "text-teal-400" : "text-white"}`}
              />
              <span className="text-sm">Expiring Soon</span>
            </div>
            <div className="h-px bg-zinc-800 mx-3 my-2" />
            {/* Folders header moved here (below separator) */}
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-medium text-gray-300">Folders</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onCreateFolder(selectedFolderId)}
                className="h-7 w-7 p-0 text-gray-300 hover:text-white hover:bg-zinc-800"
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
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            No folders yet.
          </div>
        )}

        {/* ...existing code... */}
      </div>

      {/* User Profile Section - Bottom Left */}
      {user && (
        <div className="border-t border-zinc-800 bg-black relative">
          <div
            className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-zinc-800 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              setShowProfileMenu(!showProfileMenu);
            }}
          >
            {/* Profile Picture */}
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
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
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-red-900/20 text-red-400 text-left transition-colors"
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
              className="fixed z-[9999] bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 py-1 min-w-[140px]"
              style={{
                top: `${contextMenu.y}px`,
                left: `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - 150))}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800 text-gray-300 text-left"
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
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-800 text-gray-300 text-left"
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
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-900/20 text-red-400 text-left"
                onClick={() => {
                  handleDelete(contextMenu.folderId);
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
    </div>
  );
}
