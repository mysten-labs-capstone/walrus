import { useState, useEffect, useMemo } from "react";
import { useAuth } from "./auth/AuthContext"; 
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import UploadQueuePanel from "./components/UploadQueuePanel";
import MetricsTable from "./components/MetricsTable";
import FolderTree from "./components/FolderTree";
import FolderCardView from "./components/FolderCardView";
import CreateFolderDialog from "./components/CreateFolderDialog";
import { getServerOrigin, apiUrl } from './config/api';
import { addCachedFile, CachedFile } from './lib/fileCache';
import { PanelLeftClose, PanelLeft, X } from 'lucide-react';
import { authService } from "./services/authService";

export default function App() {
  const { isAuthenticated, setPrivateKey, privateKey } = useAuth();
  const [uploadedFiles, setUploadedFiles] = useState<CachedFile[]>([]);
  const [epochs, setEpochs] = useState(3); // Default: 3 epochs = 90 days
  const user = authService.getCurrentUser();
  
  // Folder system state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'all' | 'recents' | 'shared' | 'expiring' | 'upload-queue'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [createFolderDialogOpen, setCreateFolderDialogOpen] = useState(false);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [sharedFiles, setSharedFiles] = useState<any[]>([]);

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

  // Load files from server on mount and when user changes
  useEffect(() => {
    loadFiles();
    loadSharedFiles();
  }, [user?.id]);

  // Periodic refresh - increased interval to reduce server CPU load (Render has 1 CPU limit)
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      loadFiles();
    }, 30000); // 30 seconds - reduced frequency to prevent CPU exhaustion

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

  // Convert CachedFile to FileItem format for FolderCardView
  const fileItems = useMemo(() => {
    let filtered = uploadedFiles;
    
    // Apply view filters and sorting
    if (currentView === 'recents') {
      // Get 10 most recently uploaded files, sorted by most recent first
      filtered = [...uploadedFiles]
        .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
        .slice(0, 10);
    } else if (currentView === 'expiring') {
      // Files with 10 days or less remaining, sorted by closest to expiring first
      filtered = uploadedFiles
        .filter(f => {
          const uploadDate = new Date(f.uploadedAt);
          const daysPerEpoch = 14;
          const totalDays = (f.epochs || 3) * daysPerEpoch;
          const expiryDate = new Date(uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
          const now = new Date();
          const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          return daysRemaining <= 10 && daysRemaining > 0;
        })
        .sort((a, b) => {
          // Calculate days remaining for each
          const calcDaysRemaining = (f: CachedFile) => {
            const uploadDate = new Date(f.uploadedAt);
            const daysPerEpoch = 14;
            const totalDays = (f.epochs || 3) * daysPerEpoch;
            const expiryDate = new Date(uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
            const now = new Date();
            return Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          };
          return calcDaysRemaining(a) - calcDaysRemaining(b); // Ascending: closest to expiring first
        });
    } else if (currentView === 'shared') {
      // Show files that have active shares, sorted by share expiry (closest first)
      const sharedBlobIds = new Set(sharedFiles.map(s => s.blobId));
      const sharedMap = new Map(sharedFiles.map(s => [s.blobId, s]));
      
      filtered = uploadedFiles
        .filter(f => sharedBlobIds.has(f.blobId))
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
      filtered = uploadedFiles.filter(f => f.folderId === selectedFolderId);
    }
    
    return filtered.map(f => ({
      blobId: f.blobId,
      name: f.name,
      size: f.size,
      type: f.type,
      encrypted: f.encrypted,
      uploadedAt: f.uploadedAt,
      epochs: f.epochs,
      status: f.status,
      folderId: f.folderId || null,
      wrappedFileKey: f.wrappedFileKey || null,
    }));
  }, [uploadedFiles, currentView, selectedFolderId, sharedFiles]);

  const handleCreateFolder = (parentId: string | null) => {
    setCreateFolderParentId(parentId);
    setCreateFolderDialogOpen(true);
  };

  const handleFolderCreated = () => {
    setFolderRefreshKey(prev => prev + 1);
    setCreateFolderDialogOpen(false);
    loadFiles(); // Refresh files to update folder counts
  };

  const handleUploadClick = () => {
    setUploadDialogOpen(true);
  };

  const handleFileMoved = async () => {
    await loadFiles(); // Refresh files after move
    setFolderRefreshKey(prev => prev + 1); // Refresh folders to update counts
  };

  const handleFolderDeleted = () => {
    setFolderRefreshKey(prev => prev + 1);
    loadFiles(); // Refresh files
  };

  const handleSharedFilesRefresh = () => {
    loadSharedFiles(); // Refresh shared files list
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
            flex-shrink-0 flex flex-col
          `}
        >
          <div className="w-64 h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <FolderTree
                selectedFolderId={selectedFolderId}
                onSelectFolder={(id) => {
                  setSelectedFolderId(id);
                  if (id !== null) setCurrentView('all');
                }}
                onCreateFolder={handleCreateFolder}
                onRefresh={folderRefreshKey > 0 ? undefined : undefined}
                key={folderRefreshKey}
                onUploadClick={handleUploadClick}
                onSelectView={(view) => {
                  setCurrentView(view);
                  setSelectedFolderId(null);
                }}
                currentView={currentView}
              />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8 overflow-auto">
          {/* Sidebar toggle */}
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
          </div>

          {/* Show upload section when upload dialog is open, otherwise show folder/file view */}
          {uploadDialogOpen ? (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-semibold">Upload Files</h2>
                <button
                  onClick={() => setUploadDialogOpen(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <UploadSection 
                onUploaded={(file) => {
                  handleFileUploaded(file);
                }} 
                epochs={epochs} 
                onEpochsChange={setEpochs}
                onFileQueued={() => {
                  // Keep upload section open to show queue
                }}
              />
              {/* Upload Queue - Only visible in upload section */}
              <div className="mt-6">
                <UploadQueuePanel epochs={epochs} onUploadClick={handleUploadClick} />
              </div>
            </div>
          ) : (
            <>
              {/* Unified Folder/File View */}
              <FolderCardView
                files={fileItems}
                currentFolderId={selectedFolderId}
                onFolderChange={setSelectedFolderId}
                onFileDeleted={handleFileDeleted}
                onFileMoved={handleFileMoved}
                onFolderDeleted={handleFolderDeleted}
                onFolderCreated={handleFolderCreated}
                onUploadClick={handleUploadClick}
                currentView={currentView}
                sharedFiles={sharedFiles}
                onSharedFilesRefresh={handleSharedFilesRefresh}
                folderRefreshKey={folderRefreshKey}
              />
            </>
          )}
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