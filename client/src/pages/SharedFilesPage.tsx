import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2, AlertCircle, FileText, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { AppLayout } from "../components";
import { apiUrl } from "../config/api";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";
import { downloadBlob } from "../services/walrusApi";
import { decryptWalrusBlob } from "../services/decryptWalrusBlob";

type SavedShareFile = {
  id: string;
  shareId: string;
  blobId: string;
  filename: string;
  originalSize: number;
  contentType: string;
  uploadedBy: string;
  uploadedByUsername?: string;
  savedAt: string;
  lastAccessedAt: string;
};

export default function SharedFilesPage() {
  console.log("[SharedFilesPage] Component mounted");
  const navigate = useNavigate();
  const { privateKey } = useAuth();
  const [files, setFiles] = useState<SavedShareFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSavedFiles = useCallback(async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const user = authService.getCurrentUser();
      console.log("[SharedFilesPage] Current user:", user);
      if (!user?.id) {
        console.error("[SharedFilesPage] No user ID found");
        navigate("/login");
        return;
      }

      const url = apiUrl(`/api/shares/saved?userId=${user.id}`);
      console.log("[SharedFilesPage] Fetching saved files from:", url);
      const response = await fetch(url);
      console.log("[SharedFilesPage] Response status:", response.status);
      
      if (!response.ok) {
        const text = await response.text();
        console.error("[SharedFilesPage] Response error:", response.status, text);
        throw new Error("Failed to load saved files");
      }

      const data = await response.json();
      console.log("[SharedFilesPage] Received data:", data);
      setFiles(data.savedShares || []);
      console.log("[SharedFilesPage] Set files:", data.savedShares?.length || 0, "files");
    } catch (err: any) {
      console.error("[SharedFilesPage] Error loading files:", err);
      setError(err.message || "Failed to load saved files");
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [navigate]);

  useEffect(() => {
    loadSavedFiles(true);
  }, [loadSavedFiles]);

  useEffect(() => {
    const refresh = () => loadSavedFiles(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadSavedFiles]);

  const handleDownload = async (file: SavedShareFile) => {
    setDownloadingId(file.blobId);
    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        throw new Error("Not authenticated");
      }

      const res = await downloadBlob(file.blobId, privateKey || "", file.filename, user.id);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Download failed");
      }

      const blob = await res.blob();

      // Try to decrypt if we have a private key
      if (privateKey) {
        try {
          const baseName = file.filename.replace(/\.[^.]*$/, "");
          const result = await decryptWalrusBlob(blob, privateKey, baseName);

          if (result) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(result.blob);
            a.download = result.suggestedName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            return;
          }
        } catch (decryptErr) {
          console.warn("Decryption failed, downloading as-is:", decryptErr);
        }
      }

      // Download unencrypted or if decryption failed
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      console.error("[SharedFilesPage] Download error:", err);
      setError(err.message || "Download failed");
      setTimeout(() => setError(null), 5000);
    } finally {
      setDownloadingId(null);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <AppLayout showHeader={false}>
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
          <div className="flex items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
            <span className="text-lg text-gray-600 dark:text-gray-300">Loading shared files...</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showHeader={false}>
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-gray-900 dark:to-gray-800">
        <div className="container mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Shared Files
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Files that have been shared with you
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          )}

          {files.length === 0 ? (
            <Card className="border-blue-200/50">
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  No shared files yet
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500">
                  When someone shares a file with you, you can save it here for easy access
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {files.map((file) => (
                <Card key={file.id} className="border-blue-200/50 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate mb-1">
                          {file.filename}
                        </h3>
                        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <FileText className="h-4 w-4" />
                            {formatBytes(file.originalSize)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            Saved {formatDate(file.savedAt)}
                          </span>
                          {file.uploadedByUsername && (
                            <span>Shared by @{file.uploadedByUsername}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => handleDownload(file)}
                        disabled={downloadingId === file.blobId}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                      >
                        {downloadingId === file.blobId ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Downloading
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
