import { useState, useEffect } from "react";
import { useAuth } from "./auth/AuthContext"; 
import { useLocation, useNavigate } from 'react-router-dom';
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import RecentUploads from "./components/RecentUploads";
import DownloadSection from "./components/DownloadSection";
import UploadQueuePanel from "./components/UploadQueuePanel";
import MetricsTable from "./components/MetricsTable";
import { getServerOrigin, apiUrl } from './config/api';
import { addCachedFile, CachedFile } from './lib/fileCache';
import { Upload, Download, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { authService } from "./services/authService";

console.log("[Client] Resolved API Base:", getServerOrigin());

type PageView = 'upload' | 'download' | 'history';

export default function App() {
  const { isAuthenticated, setPrivateKey, privateKey } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Determine current page from URL
  const getCurrentPage = (): PageView => {
    const path = location.pathname;
    if (path.includes('/download')) return 'download';
    if (path.includes('/history')) return 'history';
    return 'upload';
  };
  
  const currentPage = getCurrentPage();
  const [uploadedFiles, setUploadedFiles] = useState<CachedFile[]>([]);
  const [epochs, setEpochs] = useState(3); // Default: 3 epochs = 90 days
  const user = authService.getCurrentUser();

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
      console.log('[App] No user ID, skipping file load');
      setUploadedFiles([]);
      return;
    }

    console.log('[App] Loading files for user:', user.id);
    try {
      const res = await fetch(apiUrl(`/api/cache?userId=${user.id}`));
      console.log('[App] Cache API response status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[App] Files from server:', data);
        const files = data.files.map((f: any) => ({
          blobId: f.blobId,
          name: f.filename,
          size: f.originalSize,
          type: f.contentType || 'application/octet-stream',
          encrypted: f.encrypted,
          uploadedAt: f.uploadedAt,
          epochs: f.epochs || 3,
        }));
        console.log('[App] Mapped files:', files);
        // Deduplicate by blobId - keep server version as source of truth
        const deduped = Array.from(new Map(files.map(f => [f.blobId, f])).values());
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

  // Periodic refresh every 30 seconds to keep data up-to-date
  useEffect(() => {
    if (!user?.id) return;

    const interval = setInterval(() => {
      loadFiles();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [user?.id]);

  const handleFileUploaded = (file: { blobId: string; file: File; encrypted: boolean; epochs?: number }) => {
    // Refresh from server instead of adding locally to avoid duplicates
    console.log('[App] File uploaded, refreshing from server:', file.blobId);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Main Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 min-h-[calc(100vh-200px)]">
        <Tabs value={currentPage} onValueChange={(v: string) => navigate(`/home/${v}`)} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="download" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
              {uploadedFiles.length > 0 && (
                <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
                  {uploadedFiles.length}
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

          <TabsContent value="download" className="space-y-6 animate-fade-in">
            <DownloadSection />
          </TabsContent>

          <TabsContent value="history" className="space-y-6 animate-fade-in">
            <RecentUploads items={uploadedFiles} onFileDeleted={handleFileDeleted} />
          </TabsContent>
        </Tabs>

        {/* Upload Queue - Always visible regardless of tab */}
        <div className="mt-6">
          <UploadQueuePanel />
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-blue-200/50 bg-white/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground">
            Powered by Walrus & Sui • Secure Decentralized Storage
          </p>
        </div>
      </footer>
    </div>
  );
}