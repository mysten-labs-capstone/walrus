import React, { useState } from "react";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import SideBar from "./SideBar";

interface AppLayoutProps {
  children: React.ReactNode;
  showFolderNavigation?: boolean;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  showFolderNavigation = false,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<
    "all" | "recents" | "shared" | "expiring" | "upload-queue"
  >("all");

  return (
    <div className="flex min-h-screen bg-black">
      {/* Sidebar */}
      <aside
        className={`
          ${sidebarOpen ? "w-64" : "w-0"} 
          transition-all duration-300 overflow-hidden
          main-sidebar
          flex-shrink-0 flex flex-col
        `}
      >
        <div className="w-64 h-full flex flex-col overflow-hidden main-sidebar-content main-scrollbar">
          <div className="flex-1 overflow-y-auto">
            <SideBar
              selectedFolderId={showFolderNavigation ? selectedFolderId : null}
              onSelectFolder={
                showFolderNavigation ? setSelectedFolderId : () => {}
              }
              onCreateFolder={() => {}}
              currentView={currentView}
              onSelectView={setCurrentView}
              onUploadClick={undefined}
            />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative bg-black min-h-screen">
        {/* Sidebar toggle - positioned absolute */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute top-4 left-4 z-10 p-2 hover:bg-zinc-800 rounded-lg transition-colors text-gray-300 hover:text-white"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          {sidebarOpen ? (
            <PanelLeftClose className="h-5 w-5" />
          ) : (
            <PanelLeft className="h-5 w-5" />
          )}
        </button>

        {/* Site header */}
        <header className="w-full border-b border-zinc-800 bg-black/50 relative">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <a href="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="Walrus Logo" className="h-6 w-auto" />
              <span className="text-lg font-semibold text-white">Walrus</span>
            </a>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
};

export default AppLayout;
