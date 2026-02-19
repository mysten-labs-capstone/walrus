import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  AlertCircle,
  CheckCircle,
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
import SlidesCarousel from "../components/SlidesCarousel";
import { apiUrl } from "../config/api";
import "./css/Login.css";
import "./css/SharePage.css";
import { decryptWithSharedKey } from "../services/crypto";
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
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAuthenticatedLocal, setIsAuthenticatedLocal] = useState(false);
  const [autoSaveAfterLogin, setAutoSaveAfterLogin] = useState(false);

  const currentUserId = authService.getCurrentUser()?.id;
  const isOwnShare = Boolean(
    isAuthenticatedLocal &&
    shareInfo &&
    currentUserId &&
    shareInfo.uploadedBy === currentUserId,
  );

  useEffect(() => {
    const syncAuth = () => {
      setIsAuthenticatedLocal(authService.isAuthenticated());
    };

    syncAuth();
    window.addEventListener("storage", syncAuth);
    window.addEventListener("focus", syncAuth);

    return () => {
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("focus", syncAuth);
    };
  }, []);

  // Watch for authentication state changes and trigger auto-save if needed
  useEffect(() => {
    if (autoSaveAfterLogin && authService.isAuthenticated() && shareInfo) {
      setAutoSaveAfterLogin(false);
      setTimeout(() => handleSave(), 500); // Small delay to ensure state is updated
    }
  }, [isAuthenticated]);

  // Auto-save after login redirect (persisted across navigation)
  useEffect(() => {
    if (!shareInfo || !shareId || !authService.isAuthenticated()) return;

    const pendingSaveId = sessionStorage.getItem("pendingShareSave");
    if (pendingSaveId && pendingSaveId === shareId) {
      sessionStorage.removeItem("pendingShareSave");
      setTimeout(() => handleSave(), 300);
    }
  }, [shareInfo, shareId, isAuthenticatedLocal]);

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

          if (data.uploading) {
            setError(
              "This file is still being uploaded to Walrus. Please wait a moment and refresh the page.",
            );
          } else if (data.revoked) {
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
          try {
            if (shareId) {
              localStorage.setItem(
                `walrus_share_key:${shareId}`,
                fileKeyBase64url,
              );
              sessionStorage.setItem(
                `walrus_share_key:${shareId}`,
                fileKeyBase64url,
              );
            }
          } catch {}
          // Store the key for later decryption
          setFileKey(fileKeyBase64url);
        }

        setShareInfo(info);
        setLoading(false);
      } catch (err: any) {
        console.error("[SharePage] Error loading share:", err);
        setError("Failed to load share");
        setLoading(false);
      }
    }

    loadShare();
  }, [shareId]);

  const handleSave = async () => {
    if (!shareInfo || !authService.isAuthenticated()) return;

    setSaving(true);
    setError("");

    try {
      const user = authService.getCurrentUser();
      if (!user?.id) {
        throw new Error("Not authenticated");
      }

      if (shareInfo.uploadedBy === user.id) {
        throw new Error("You already own this file.");
      }

      const response = await fetch(apiUrl("/api/shares/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      if (!response.ok) {
        const text = await response.text();
        console.error(
          "[SharePage] Save error response:",
          response.status,
          response.statusText,
          text,
        );
        try {
          const data = JSON.parse(text);
          throw new Error(
            data.error || `Failed to save file (${response.status})`,
          );
        } catch (parseErr) {
          throw new Error(
            `Server error: ${response.status} ${response.statusText} - ${text.substring(0, 200)}`,
          );
        }
      }

      const data = await response.json();
      setSaveSuccess(true);
      // Navigate to shared files view after successful save
      setTimeout(() => navigate("/home?view=shared"), 2000);
    } catch (err: any) {
      console.error("[SharePage] Save error:", err);
      setError("Failed to save file");
    } finally {
      setSaving(false);
    }
  };

  const handleLoginAndSave = () => {
    // Store intention to save after login
    setAutoSaveAfterLogin(true);
    // Store the share info in sessionStorage so we can use it after redirect
    sessionStorage.setItem("pendingShareId", shareId || "");
    sessionStorage.setItem("pendingShareSave", shareId || "");
    sessionStorage.setItem(
      "pendingShareReturnTo",
      window.location.pathname + window.location.hash,
    );
    navigate("/login", {
      state: { from: window.location.pathname + window.location.hash },
    });
  };

  const handleDownload = async () => {
    if (!shareInfo) return;

    setDownloading(true);
    setError("");

    try {
      // Re-validate share status before downloading (in case it was revoked)
      if (shareId) {
        const shareCheckResponse = await fetch(apiUrl(`/api/shares/${shareId}`));
        if (!shareCheckResponse.ok) {
          const shareData = await shareCheckResponse.json();
          if (shareData.revoked) {
            setError("This share link has been revoked by the owner.");
            // Reload share info to update UI
            window.location.reload();
            return;
          } else if (shareData.expired) {
            setError("This share link has expired.");
            return;
          } else if (shareData.limitReached) {
            setError("Download limit reached for this share link.");
            return;
          }
        }
      }

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
        if (data.revoked) {
          setError("This share link has been revoked by the owner.");
          // Reload share info to update UI
          window.location.reload();
          return;
        } else if (data.expired) {
          setError("This share link has expired.");
          return;
        } else if (data.limitReached) {
          setError("Download limit reached for this share link.");
          return;
        }
        throw new Error(data.error || "Download failed");
      }

      const blob = await response.blob();

      if (shareInfo.encrypted) {
        if (!fileKey) throw new Error("Missing file key for decryption");

        const decryptResult = await decryptWithSharedKey(
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
      setError("Download failed");
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
      <div className="login-page share-login-page">
        <div className="login-left">
          <div className="container">
            <div className="login-logo">
              <div className="logo-row">
                <a href="/" className="logo-mark-link">
                  <img
                    src="/logo+text.svg"
                    alt="Walrus Logo"
                    className="login-logo-img h-12 w-auto"
                  />
                </a>
              </div>
            </div>

            <div className="form-space">
              <Card className="w-full bg-zinc-900 border-0 shadow-none">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading share...</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <SlidesCarousel />
      </div>
    );
  }

  if (error && !shareInfo) {
    return (
      <div className="login-page share-login-page">
        <div className="login-left">
          <div className="container">
            <div className="login-logo">
              <div className="logo-row">
                <a href="/" className="logo-mark-link">
                  <img
                    src="/logo+text.svg"
                    alt="Walrus Logo"
                    className="login-logo-img h-12 w-auto"
                  />
                </a>
              </div>
            </div>

            <div className="form-space">
              <Card className="w-full bg-zinc-900 border-0 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    Share Not Available
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground mb-4">{error}</p>
                  <button
                    className="btn btn-gradient liquid-btn w-full"
                    onClick={() => navigate("/")}
                  >
                    Go Home
                  </button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <SlidesCarousel />
      </div>
    );
  }

  return (
    <div className="login-page share-login-page">
      {/* Left Panel - Download */}
      <div className="login-left">
        <div className="container">
          <div className="login-logo">
            <div className="logo-row">
              <a href="/" className="logo-mark-link">
                <img
                  src="/logo+text.svg"
                  alt="Walrus Logo"
                  className="login-logo-img h-12 w-auto"
                />
              </a>
            </div>
          </div>

          <div className="form-space">
            <Card className="w-full bg-black border-0 shadow-none">
              <CardHeader>
                <CardDescription>A file was shared with you</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {shareInfo && (
                  <>
                    {/* File Info */}
                    <div className="space-y-2 p-4 rounded-lg bg-[#0b1220] border border-gray-800">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="font-medium truncate text-gray-200">
                            {shareInfo.filename}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatBytes(shareInfo.size)}
                          </p>
                        </div>
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

                    {/* Error Display */}
                    {error && (
                      <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                        {error}
                      </div>
                    )}

                    {/* Download Button */}
                    <Button
                      className="w-full download-button-main disabled:opacity-50"
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
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          className="w-full py-3 !bg-none !bg-transparent !border !border-[rgba(255,255,255,0.18)] !text-[rgba(255,255,255,0.75)] hover:!bg-[rgba(255,255,255,0.06)] hover:!text-white hover:!brightness-100"
                          onClick={handleSave}
                          disabled={saving || isOwnShare}
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

                        {isOwnShare && (
                          <div className="text-sm text-white/60">
                            You already own this file.
                          </div>
                        )}

                        {saveSuccess && (
                          <div className="text-sm text-emerald-300 opacity-80">
                            File added successfully
                          </div>
                        )}
                      </div>
                    )}

                    {/* Login to Save Button (not authenticated) */}
                    {!isAuthenticatedLocal && (
                      <Button
                        variant="outline"
                        className="w-full py-3 !bg-none !bg-transparent !border !border-[rgba(255,255,255,0.18)] !text-[rgba(255,255,255,0.75)] hover:!bg-[rgba(255,255,255,0.06)] hover:!text-white hover:!brightness-100"
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
        </div>
      </div>

      {/* Right Panel - Slides Carousel */}
      <SlidesCarousel />
    </div>
  );
}
