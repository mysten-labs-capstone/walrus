import { useState, useEffect } from "react";
import { useAuth } from "./auth/AuthContext"; 
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import RecentUploads from "./components/RecentUploads";
import DownloadSection from "./components/DownloadSection";
import UploadQueuePanel from "./components/UploadQueuePanel";
import MetricsTable from "./components/MetricsTable";
import { getServerOrigin } from './config/api';
import { getCachedFiles, addCachedFile, CachedFile } from './lib/fileCache';
import { Upload, Download, History } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { authService } from "./services/authService";

console.log("[Client] Resolved API Base:", getServerOrigin());

type PageView = 'upload' | 'downloads' | 'history';

export default function App() {
  const { isAuthenticated } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageView>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<CachedFile[]>([]);
  const user = authService.getCurrentUser();

  // Load cached files on mount
  useEffect(() => {
    const cached = getCachedFiles();
    setUploadedFiles(cached);
  }, []);

  const handleFileUploaded = (file: { blobId: string; file: File; encrypted: boolean }) => {
    const cachedFile: CachedFile = {
      blobId: file.blobId,
      name: file.file.name,
      size: file.file.size,
      type: file.file.type,
      encrypted: file.encrypted,
      uploadedAt: new Date().toISOString(),
    };
    addCachedFile(cachedFile);
    setUploadedFiles((prev) => [cachedFile, ...prev]);
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
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Tabs value={currentPage} onValueChange={(v: string) => setCurrentPage(v as PageView)} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="downloads" className="flex items-center gap-2">
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
            <UploadSection onUploaded={handleFileUploaded} />
            <UploadQueuePanel />
          </TabsContent>

          <TabsContent value="downloads" className="space-y-6 animate-fade-in">
            <DownloadSection />
          </TabsContent>

          <TabsContent value="history" className="space-y-6 animate-fade-in">
            <RecentUploads items={uploadedFiles} />
          </TabsContent>
        </Tabs>
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