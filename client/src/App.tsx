import { useState, useEffect, useMemo } from "react";
import { useAuth } from "./auth/AuthContext"; 
import { useLocation, useNavigate } from 'react-router-dom';
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import RecentUploads from "./components/RecentUploads";
import UploadQueuePanel from "./components/UploadQueuePanel";
import MetricsTable from "./components/MetricsTable";
import FolderTree from "./components/FolderTree";
import CreateFolderDialog from "./components/CreateFolderDialog";
import { getServerOrigin, apiUrl } from './config/api';
import { addCachedFile, CachedFile } from './lib/fileCache';
import { Upload, History, FolderTree as FolderTreeIcon, PanelLeftClose, PanelLeft } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { authService } from "./services/authService";

// Resolved API base intentionally silent in production

type PageView = 'upload' | 'history';

export default function App() {
  const { isAuthenticated, setPrivateKey, privateKey } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine current page from URL
  const getCurrentPage = (): PageView => {
    const path = location.pathname;
    if (path.includes('/history')) return 'history';
    return 'upload';
  };
  
  const currentPage = getCurrentPage();
  const [uploadedFiles, setUploadedFiles] = useState<CachedFile[]>([]);
  const [epochs, setEpochs] = useState(3); // Default: 3 epochs = 90 days
  const user = authService.getCurrentUser();
  
  // Folder system state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);

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
        console.warn('Could not load encryption key:', err);
      }
    };

    loadPrivateKey();
  }, [user?.id, privateKey, setPrivateKey]);

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
          type: f.contentType || 'application/octet-stream',
          encrypted: f.encrypted,
          uploadedAt: f.uploadedAt,
          epochs: f.epochs || 3,
          status: f.status,
          s3Key: f.s3Key,
          wrappedFileKey: f.wrappedFileKey, // NEW: per-file encryption key
          folderId: f.folderId || null,
          folderPath: f.folderPath || null,
        }));
        
        // Deduplicate by blobId - keep server version as source of truth
        const deduped = Array.from(new Map(files.map((f: CachedFile) => [f.blobId, f])).values());
        setUploadedFiles(deduped);
      } else {
        console.error('[App] Failed to fetch files, status:', res.status);
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  };

  // Load files from server on mount and when user changes
  useEffect(() => {
    loadFiles();
  }, [user?.id]);

  // Periodic refresh every 5 seconds to keep data up-to-date (for live status updates)
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      loadFiles();
    }, 5000); // 5 seconds for live badge updates

    return () => clearInterval(interval);
  }, [user?.id]);

  const handleFileUploaded = (file: { blobId: string; file: File; encrypted: boolean; epochs?: number }) => {
    // Refresh from server instead of adding locally to avoid duplicates
    loadFiles();
  };

  const handleFileDeleted = async () => {
    // Refresh the file list from server
    await loadFiles();
  };

  useEffect(() => {
    const handleLazyUpload = (e: CustomEvent) => {
      const file = e.detail;
      // Add to cache for persistence across sessions
      addCachedFile(file);
      setUploadedFiles((prev) => [file, ...prev]);
    };
    window.addEventListener("lazy-upload-finished", handleLazyUpload as EventListener);
    return () =>
      window.removeEventListener("lazy-upload-finished", handleLazyUpload as EventListener);
  }, []);

  // Filter files by selected folder
  const filteredFiles = useMemo(() => {
    if (selectedFolderId === null) {
      return uploadedFiles; // Show all files when "All Files" is selected
    }
    return uploadedFiles.filter(f => f.folderId === selectedFolderId);
  }, [uploadedFiles, selectedFolderId]);

  // Get selected folder name for display
  const selectedFolderName = useMemo(() => {
    if (selectedFolderId === null) return null;
    const file = uploadedFiles.find(f => f.folderId === selectedFolderId);
    if (file?.folderPath) {
      const parts = file.folderPath.split('/');
      return parts[parts.length - 1];
    }
    return null;
  }, [selectedFolderId, uploadedFiles]);

  const handleCreateFolder = (parentId: string | null) => {
    setCreateFolderParentId(parentId);
    setCreateFolderDialogOpen(true);
  };

  const handleFolderCreated = () => {
    setFolderRefreshKey(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      <div className="flex min-h-[calc(100vh-80px)]">
        {/* Folder Sidebar */}
        <aside 
          className={`
            ${sidebarOpen ? 'w-64' : 'w-0'} 
            transition-all duration-300 overflow-hidden
            bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm
            border-r border-blue-200/50 dark:border-slate-700
            flex-shrink-0
          `}
        >
          <div className="w-64 h-full overflow-y-auto">
            <FolderTree
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              onCreateFolder={handleCreateFolder}
              onRefresh={folderRefreshKey > 0 ? undefined : undefined}
              key={folderRefreshKey}
            />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 overflow-auto">
          {/* Sidebar toggle and folder breadcrumb */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
              title={sidebarOpen ? 'Hide folders' : 'Show folders'}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <PanelLeft className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
            
            {selectedFolderId && selectedFolderName && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <FolderTreeIcon className="h-4 w-4" />
                <span>Viewing: <strong className="text-gray-900 dark:text-gray-100">{selectedFolderName}</strong></span>
                <button
                  onClick={() => setSelectedFolderId(null)}
                  className="ml-2 text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  (Show all)
                </button>
              </div>
            )}
          </div>

          <Tabs value={currentPage} onValueChange={(v: string) => navigate(`/home/${v}`)} className="w-full">
            <TabsList className="grid w-full max-w-md mx-auto grid-cols-2 justify-center mb-8">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload
              </TabsTrigger>
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History
                {filteredFiles.length > 0 && (
                  <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
                    {filteredFiles.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-6 animate-fade-in">
              <UploadSection 
                onUploaded={handleFileUploaded} 
                epochs={epochs} 
                onEpochsChange={setEpochs}
              />
            </TabsContent>

            {/* Download tab removed — download handled from file-specific actions */}

            <TabsContent value="history" className="space-y-6 animate-fade-in">
              <RecentUploads items={filteredFiles} onFileDeleted={handleFileDeleted} />
            </TabsContent>
          </Tabs>

          {/* Upload Queue - Always visible regardless of tab */}
          <div className="mt-6">
            <UploadQueuePanel />
          </div>
        </main>
      </div>

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={createFolderDialogOpen}
        onClose={() => setCreateFolderDialogOpen(false)}
        parentId={createFolderParentId}
        onFolderCreated={handleFolderCreated}
      />

      {/* Footer */}
      <footer className="border-t border-blue-200/50 bg-white/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            Powered by Walrus & Sui • Secure Decentralized Storage
          </p>
        </div>
      </footer>
    </div>
  );
}