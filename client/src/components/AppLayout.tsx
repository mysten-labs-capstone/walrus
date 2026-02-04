import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  PanelLeftClose,
  PanelLeft,
  Home,
  Upload,
  Clock,
  Share2,
  AlertTriangle,
  ListTodo,
  FolderPlus,
  Folder,
  User,
  Wallet,
  LogOut,
  DollarSign,
} from "lucide-react";
import SideBar from "./SideBar";
import CreateFolderDialog from "./CreateFolderDialog";

interface AppLayoutProps {
  children: React.ReactNode;
  showFolderNavigation?: boolean;
  showHeader?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  showFolderNavigation = false,
  showHeader = true,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHomeRoute =
    location.pathname === "/" || location.pathname.startsWith("/home");

  // Start with sidebar closed on non-home routes, open on home routes
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("sidebarOpen");
      return saved !== null ? JSON.parse(saved) : isHomeRoute;
    } catch {
      return isHomeRoute;
    }
  });
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<
    "all" | "recents" | "shared" | "expiring" | "upload-queue" | "favorites"
  >("all");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<
    string | null
  >(null);

  // Persist sidebar state to localStorage
  useEffect(() => {
    localStorage.setItem("sidebarOpen", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  // Close profile menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setShowProfileMenu(false);
    if (showProfileMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showProfileMenu]);

  const handleCreateFolder = (parentId: string | null) => {
    setCreateFolderParentId(parentId);
    setCreateFolderDialogOpen(true);
  };

  const handleFolderCreated = (folder?: {
    id: string;
    name: string;
    parentId: string | null;
    color: string | null;
  }) => {
    setCreateFolderDialogOpen(false);
    // Navigate to home after folder is created
    navigate("/home?view=all");
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("username");
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-black">
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
            onClick={() =>
              navigate("/home?view=all", {
                state: { openUploadPicker: true },
              })
            }
            className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
            title="Upload"
          >
            <Upload className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>

          {/* Views */}
          <button
            onClick={() => {
              setCurrentView("all");
              navigate("/home?view=all");
            }}
            className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
            title="Your Storage"
          >
            <Home className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>

          <button
            onClick={() => {
              setCurrentView("upload-queue");
              navigate("/home?view=upload-queue");
            }}
            className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
            title="Upload Queue"
          >
            <ListTodo className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>

          <button
            onClick={() => {
              setCurrentView("recents");
              navigate("/home?view=recents");
            }}
            className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
            title="Recents"
          >
            <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>

          <button
            onClick={() => {
              setCurrentView("shared");
              navigate("/home?view=shared");
            }}
            className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
            title="Shared Files"
          >
            <Share2 className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>

          <button
            onClick={() => {
              setCurrentView("expiring");
              navigate("/home?view=expiring");
            }}
            className="p-1 sm:p-1.5 hover:bg-zinc-800 rounded-md transition-colors text-gray-300 hover:text-white"
            title="Expiring Soon"
          >
            <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>

          <div className="h-px w-8 sm:w-10 bg-zinc-800 my-1 sm:my-1.5" />

          {/* Add folder button */}
          <button
            onClick={() => handleCreateFolder(null)}
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
                className="absolute bottom-full left-0 mb-0 bg-zinc-900 rounded-lg shadow-xl border border-zinc-800 py-2 z-50 min-w-[180px]"
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

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 z-20 ${sidebarOpen ? "w-full sm:w-64" : "w-0"} transition-all duration-300 overflow-hidden main-sidebar flex-shrink-0 flex flex-col`}
      >
        <div className="w-full sm:w-64 h-screen flex flex-col overflow-hidden main-sidebar-content">
          <div className="flex-1 overflow-y-auto overscroll-none main-scrollbar">
            <SideBar
              selectedFolderId={showFolderNavigation ? selectedFolderId : null}
              onSelectFolder={
                showFolderNavigation ? setSelectedFolderId : () => {}
              }
              onCreateFolder={handleCreateFolder}
              currentView={isHomeRoute ? currentView : undefined}
              onSelectView={setCurrentView}
              onUploadClick={() =>
                window.dispatchEvent(new Event("open-upload-picker"))
              }
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 overflow-auto relative bg-black min-h-screen transition-all ${sidebarOpen ? "ml-0 sm:ml-64" : "ml-12 sm:ml-16"} ${showHeader ? "" : "pt-16"}`}
      >
        {/* Sidebar toggle button when sidebar is hidden - REMOVED, now in mini sidebar */}

        {/* Site header (hidden on some pages) */}
        {showHeader && (
          <header className="w-full border-b border-zinc-800 bg-black/50 relative">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <a href="/" className="flex items-center gap-3">
                <img src="/logo.png" alt="Walrus Logo" className="h-6 w-auto" />
                <span className="text-lg font-semibold text-white">Walrus</span>
              </a>
            </div>
          </header>
        )}

        {children}
      </main>

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentId={createFolderParentId}
        onFolderCreated={handleFolderCreated}
      />
    </div>
  );
};

export default AppLayout;
