import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  AlertCircle,
  CheckCircle,
  Lock,
  FileDown,
  Loader2,
  Bookmark,
  LogIn,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { apiUrl } from "../config/api";
import { importFileKeyFromShare, decryptWithFileKey } from "../services/crypto";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";

type ShareInfo = {
  shareId: string;
  blobId: string;
  filename: string;
  size: number;
  contentType: string;
  encrypted: boolean;
  downloadCount: number;
  maxDownloads: number | null;
  expiresAt: string | null;
  createdAt: string;
  uploadedBy: string;
};

export default function SharePage() {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [fileKey, setFileKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAuthenticatedLocal, setIsAuthenticatedLocal] = useState(false);
  const [autoSaveAfterLogin, setAutoSaveAfterLogin] = useState(false);

  useEffect(() => {
    setIsAuthenticatedLocal(authService.isAuthenticated());
  }, []);

  // Watch for authentication state changes and trigger auto-save if needed
  useEffect(() => {
    if (autoSaveAfterLogin && authService.isAuthenticated() && shareInfo) {
      setAutoSaveAfterLogin(false);
      setTimeout(() => handleSave(), 500); // Small delay to ensure state is updated
    }
  }, [isAuthenticated]);

  useEffect(() => {
    async function loadShare() {
      if (!shareId) {
        setError("Invalid share link");
        setLoading(false);
        return;
      }

      try {
        // Fetch share metadata from server (no key sent)
        const response = await fetch(apiUrl(`/api/shares/${shareId}`));

        if (!response.ok) {
          const data = await response.json();

          if (data.revoked) {
            setError("This share link has been revoked by the owner.");
          } else if (data.expired) {
            setError("This share link has expired.");
          } else if (data.limitReached) {
            setError("Download limit reached for this share link.");
          } else {
            setError(data.error || "Failed to load share");
          }

          setLoading(false);
          return;
        }

        const info = await response.json();

        // If share is encrypted, extract and import the file key from URL fragment
        if (info.encrypted) {
          const hash = window.location.hash;
          const keyMatch = hash.match(/#k=([A-Za-z0-9_-]+)/);
          if (!keyMatch) {
            setError(
              "Missing encryption key in share link. Make sure you copied the full link.",
            );
            setLoading(false);
            return;
          }

          const fileKeyBase64url = keyMatch[1];
          const key = await importFileKeyFromShare(fileKeyBase64url);
          setFileKey(key);
        }

        setShareInfo(info);
        setLoading(false);
      } catch (err: any) {
        console.error("[SharePage] Error loading share:", err);
        setError(err.message || "Failed to load share");
        setLoading(false);
      }
    }

    loadShare();
  }, [shareId]);

  const handleSave = async () => {
    if (!shareInfo || !authService.isAuthenticated()) return;

    setSaving(true);
    setError('');

    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(apiUrl('/api/shares/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareId: shareId,
          blobId: shareInfo.blobId,
          filename: shareInfo.filename,
          originalSize: shareInfo.size,
          contentType: shareInfo.contentType,
          uploadedBy: shareInfo.uploadedBy,
          userId: user.id,
        }),
      });

      console.log('[SharePage] Save response status:', response.status, response.statusText);
      console.log('[SharePage] Save response headers:', {
        'content-type': response.headers.get('content-type'),
        'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[SharePage] Save error response:', response.status, response.statusText, text);
        try {
          const data = JSON.parse(text);
          throw new Error(data.error || `Failed to save file (${response.status})`);
        } catch (parseErr) {
          throw new Error(`Server error: ${response.status} ${response.statusText} - ${text.substring(0, 200)}`);
        }
      }

      const data = await response.json();
      console.log('[SharePage] Save successful:', data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('[SharePage] Save error:', err);
      setError(err.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleLoginAndSave = () => {
    // Store intention to save after login
    setAutoSaveAfterLogin(true);
    // Store the share info in sessionStorage so we can use it after redirect
    sessionStorage.setItem('pendingShareId', shareId || '');
    navigate('/login', { state: { from: window.location.pathname + window.location.hash } });
  };

  const handleDownload = async () => {
    if (!shareInfo) return;

    setDownloading(true);
    setError("");

    try {
      // Download blob from Walrus (via backend proxy)
      const response = await fetch(apiUrl("/api/download"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobId: shareInfo.blobId,
          filename: shareInfo.filename,
          shareId: shareId,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Download failed");
      }

      const blob = await response.blob();

      if (shareInfo.encrypted) {
        if (!fileKey) throw new Error("Missing file key for decryption");

        const decryptResult = await decryptWithFileKey(
          blob,
          fileKey,
          shareInfo.filename,
        );

        if (!decryptResult)
          throw new Error("Decryption failed - invalid key or corrupted file");

        const url = URL.createObjectURL(decryptResult.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = decryptResult.suggestedName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Unencrypted file: save directly
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = shareInfo.filename || "download";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("[SharePage] Download error:", err);
      setError(err.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading share...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !shareInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Share Not Available
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Shared File
          </CardTitle>
          <CardDescription>Someone shared a file with you</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {shareInfo && (
            <>
              {/* File Info */}
              <div className="space-y-2 p-4 rounded-lg bg-muted/50">
                <div className="flex items-start justify-between">
                  <div className="space-y-1 flex-1 min-w-0">
                    <p className="font-medium truncate">{shareInfo.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatBytes(shareInfo.size)}
                    </p>
                  </div>
                  {shareInfo.encrypted && (
                    <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-1 rounded">
                      <Lock className="h-3 w-3" />
                      Encrypted
                    </div>
                  )}
                </div>
              </div>

              {/* Share Metadata */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Shared on {formatDate(shareInfo.createdAt)}</p>
                {shareInfo.maxDownloads && (
                  <p>
                    Downloads: {shareInfo.downloadCount} /{" "}
                    {shareInfo.maxDownloads}
                  </p>
                )}
                {shareInfo.expiresAt && (
                  <p>Expires: {formatDate(shareInfo.expiresAt)}</p>
                )}
              </div>

              {/* Security Notice */}
              <div className="rounded-md bg-blue-50 dark:bg-blue-950/20 p-3 text-xs space-y-2">
                <p className="font-medium"> End-to-End Encrypted</p>
                <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                  <li>
                    File is encrypted and will be decrypted in your browser
                  </li>
                  <li>Decryption key never leaves your device</li>
                  <li>Server cannot see file contents</li>
                </ul>
              </div>

              {/* Error Display */}
              {error && (
                <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="rounded-md bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Success!
                </div>
              )}

              {/* Save Success Message */}
              {saveSuccess && (
                <div className="rounded-md bg-green-50 dark:bg-green-950/20 p-3 text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  File saved to your shared files!
                </div>
              )}

              {/* Download Button */}
              <Button
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50"
                onClick={handleDownload}
                disabled={downloading}
              >
                {downloading ? (
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

              {/* Save Button (authenticated users) */}
              {isAuthenticatedLocal && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving
                    </>
                  ) : (
                    <>
                      <Bookmark className="mr-2 h-4 w-4" />
                      Save to My Files
                    </>
                  )}
                </Button>
              )}

              {/* Login to Save Button (not authenticated) */}
              {!isAuthenticatedLocal && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLoginAndSave}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Login to Save
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
