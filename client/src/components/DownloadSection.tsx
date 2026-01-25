import { useCallback, useState } from "react";
import {
  Loader2,
  CheckCircle,
  XCircle,
  LockOpen,
  Download as DownloadIcon,
  Lock,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { downloadBlob } from "../services/walrusApi";
import { decryptWalrusBlob } from "../services/decryptWalrusBlob";
import { apiUrl } from "../config/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { authService } from "../services/authService";

export default function DownloadSection() {
  const { privateKey } = useAuth();
  const [blobId, setBlobId] = useState("");
  const [name, setName] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tryDecrypt, setTryDecrypt] = useState(true);

  const saveBlob = (blob: Blob, filename: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const handleDownload = useCallback(async () => {
    if (!blobId.trim()) return setError("Enter a blob ID to download.");

    setError(null);
    setStatus(null);
    setLoading(true);

    try {
      const user = authService.getCurrentUser();
      const effectiveKey = customKey.trim() || privateKey || "";

      // Fetch file metadata to obtain wrappedFileKey for E2E decryption
      let wrappedFileKey: string | undefined;
      try {
        const metaRes = await fetch(
          apiUrl(`/api/files/${blobId}?userId=${user?.id}`),
        );
        if (metaRes.ok) {
          const metadata = await metaRes.json();
          wrappedFileKey = metadata?.wrappedFileKey;
        }
      } catch (err) {
        // Non-fatal: if metadata fetch fails, continue and let server response indicate requirements
        console.warn("[DownloadSection] failed to fetch file metadata:", err);
      }

      const res = await downloadBlob(
        blobId,
        effectiveKey,
        name,
        user?.id,
        false, // decryptOnServer - we decrypt client-side
      );
      if (!res.ok) {
        let detail = "Download failed";
        try {
          const payload = await res.json();
          if (payload?.requiresKey) {
            setShowKeyInput(true);
            throw new Error(
              "This file is encrypted and requires an encryption key. Please provide it below.",
            );
          }
          detail = payload?.error ?? detail;
        } catch (err: any) {
          throw err;
        }
        throw new Error(detail);
      }

      const blob = await res.blob();

      // Try to decrypt if requested
      if (tryDecrypt) {
        if (!effectiveKey) {
          // No account key available - show key input and error
          setShowKeyInput(true);
          throw new Error(
            "Cannot decrypt: No encryption key available. Please provide your encryption key below or disable decryption to download unencrypted files.",
          );
        }

        console.log(
          "[Download] Attempting to decrypt with account key:",
          effectiveKey.substring(0, 10) + "...",
        );
        const baseName = (name?.trim() || blobId.trim()).replace(
          /\.[^.]*$/,
          "",
        );
        const result = await decryptWalrusBlob(
          blob,
          effectiveKey,
          baseName,
          wrappedFileKey,
        );

        if (result) {
          console.log("[Download] Decryption successful");
          saveBlob(result.blob, result.suggestedName);
          setStatus(`Downloaded as ${result.suggestedName}`);
          return;
        } else {
          console.warn(
            "[Download] Decryption failed - wrong key, missing wrappedFileKey, or file is not encrypted",
          );
          throw new Error(
            "Decryption failed. The file may not be encrypted, the wrapped file key is missing, or you provided the wrong account key. Try disabling decryption to download the raw file.",
          );
        }
      }

      // Download without decryption
      const filename = name?.trim() || blobId.trim();
      saveBlob(blob, filename);
      setStatus(`Downloaded as ${filename}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, [blobId, name, privateKey, customKey, tryDecrypt]);

  return (
    <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DownloadIcon className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
          Download Files
        </CardTitle>
        <CardDescription>
          Retrieve files from Walrus using their blob ID
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Decryption Toggle */}
        <div className="rounded-lg border-2 border-dashed border-blue-300/50 bg-blue-50/50 p-4 dark:border-blue-700/50 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {tryDecrypt ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-500 shadow-md">
                  <Lock className="h-5 w-5 text-white" />
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 shadow-md">
                  <LockOpen className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <p className="font-semibold text-sm">
                  {tryDecrypt ? "Decryption Enabled" : "Decryption Disabled"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tryDecrypt
                    ? "Will attempt to decrypt encrypted files"
                    : "Download files without decryption"}
                </p>
              </div>
            </div>
            <Switch
              checked={tryDecrypt}
              onCheckedChange={setTryDecrypt}
              disabled={loading}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Blob ID
            </label>
            <input
              type="text"
              value={blobId}
              onChange={(e) => setBlobId(e.target.value)}
              placeholder="Enter blob ID (e.g., Aa1Bb2Cc3...)"
              className="w-full rounded-lg border border-blue-300/50 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Filename (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Custom filename for download"
              className="w-full rounded-lg border border-blue-300/50 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-cyan-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:bg-slate-800 dark:border-slate-600 dark:text-gray-100"
            />
          </div>

          {/* Show encryption key input if needed or manually toggled */}
          {(showKeyInput || customKey) && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                <Lock className="inline h-4 w-4 mr-1" />
                Encryption Key (for shared files)
              </label>
              <input
                type="password"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="Enter encryption key if downloading someone else's file"
                autoComplete="off"
                data-form-type="other"
                className="w-full rounded-lg border border-amber-300/50 bg-gray-50 px-4 py-3 font-mono text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:bg-slate-800 dark:border-amber-600 dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {privateKey
                  ? "Your own files will use your account's key automatically"
                  : "Required for encrypted files from other users"}
              </p>
            </div>
          )}

          {/* Toggle to manually show key input */}
          {!showKeyInput && !customKey && (
            <button
              onClick={() => setShowKeyInput(true)}
              className="text-xs text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 hover:underline"
            >
              + Add encryption key for shared file
            </button>
          )}
        </div>

        <Button
          onClick={handleDownload}
          disabled={loading}
          className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <DownloadIcon className="mr-2 h-4 w-4" />
              Download
            </>
          )}
        </Button>

        {status && (
          <div className="animate-slide-up flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/50 dark:text-green-400">
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
            <span>{status}</span>
          </div>
        )}
        {error && (
          <div className="animate-slide-up flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
            <XCircle className="h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
