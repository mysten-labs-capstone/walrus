import { useState } from "react";
import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Calendar, Copy, Check, Link as LinkIcon, Clock } from "lucide-react";
import { apiUrl } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { authService } from "../services/authService";
import { exportFileKeyForShare } from "../services/crypto";
import { downloadBlob } from "../services/walrusApi";

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  blobId: string;
  filename: string;
  encrypted: boolean;
  uploadedAt?: string;
  epochs?: number;
  onShareCreated?: () => void;
};

export function ShareDialog({
  open,
  onClose,
  blobId,
  filename,
  encrypted,
  uploadedAt,
  epochs,
  onShareCreated,
}: ShareDialogProps) {
  const { privateKey } = useAuth();
  const [shareLink, setShareLink] = useState<string>("");
  const [shareKey, setShareKey] = useState<string | null>(null); // base64url file key (if encrypted)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  // QR is always shown after creating a share; default payload is key-only for safety

  // Share options
  const [expiresInDays, setExpiresInDays] = useState<number | "">(1);

  // Compute remaining lifetime for the file (days). Epochs are 14-day increments.
  const daysPerEpoch = 14;
  const calculateExpiryInfo = (
    uploadedAt: string | undefined,
    epochs: number | undefined,
  ) => {
    if (!uploadedAt)
      return { expiryDate: null as Date | null, daysRemaining: Infinity };
    const uploadDate = new Date(uploadedAt);
    const totalDays = (epochs ?? 3) * daysPerEpoch;
    const expiryDate = new Date(
      uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000,
    );
    const now = new Date();
    const daysRemaining = Math.ceil(
      (expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );
    return { expiryDate, daysRemaining: Math.max(0, daysRemaining) };
  };

  const { daysRemaining } = calculateExpiryInfo(uploadedAt, epochs);

  const handleCreateShare = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      setError("You must be logged in to share files");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Validate expiration days
      if (expiresInDays !== "" && Number(expiresInDays) < 1) {
        setError("Expiration must be 1 day or greater");
        setLoading(false);
        return;
      }

      // Ensure we don't create a share longer than the file's remaining lifetime
      if (Number.isFinite(daysRemaining) && daysRemaining <= 0) {
        setError("This file has expired on Walrus and cannot be shared");
        setLoading(false);
        return;
      }

      // Create share record on server (NO KEY SENT)
      const daysToExpire = expiresInDays || 1;
      if (
        Number.isFinite(daysRemaining) &&
        Number(daysToExpire) > daysRemaining
      ) {
        setError(
          `Expiration cannot exceed file lifetime (${daysRemaining} days)`,
        );
        setLoading(false);
        return;
      }
      const expiresAt = new Date(
        Date.now() + Number(daysToExpire) * 24 * 60 * 60 * 1000,
      ).toISOString();

      const response = await fetch(apiUrl("/api/shares"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blobId,
          userId: user.id,
          expiresAt,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create share");
      }

      const { shareId } = await response.json();
      const baseUrl = window.location.origin;

      // Notify parent that share was created
      onShareCreated?.();

      // If file is encrypted, download blob, derive key, and append as fragment
      if (encrypted) {
        if (!privateKey)
          throw new Error(
            "Private key required to export file key for encrypted file",
          );

        // Download the encrypted blob to extract fileId and derive key
        const user = authService.getCurrentUser();
        const blobResponse = await downloadBlob(blobId, privateKey, filename, user?.id);
        if (!blobResponse.ok) {
          throw new Error("Failed to download blob for key derivation");
        }
        const blobData = await blobResponse.blob();
        
        // Export file key from blob using HKDF
        const fileKeyBase64url = await exportFileKeyForShare(blobData, privateKey);
        const link = `${baseUrl}/s/${shareId}#k=${fileKeyBase64url}`;
        setShareLink(link);
        setShareKey(fileKeyBase64url);
        // Auto-copy to clipboard for smoother UX
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn("[ShareDialog] Auto-copy failed", err);
        }
      } else {
        // Unencrypted file: share link contains no embedded key
        const link = `${baseUrl}/s/${shareId}`;
        setShareLink(link);
        setShareKey(null);
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn("[ShareDialog] Auto-copy failed", err);
        }
      }
    } catch (err: any) {
      console.error("[ShareDialog] Error creating share:", err);
      setError(err.message || "Failed to create share link");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Generate QR image data URL client-side when possible; fall back to remote QR API
  useEffect(() => {
    let cancelled = false;
    // Prefer the full share link when available so QR scans to the exact link shown to the user.
    const payload = shareLink || (shareKey ? `k=${shareKey}` : "");
    if (!payload) {
      setQrDataUrl(null);
      return;
    }
    const remoteSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      payload,
    )}`;
    // Clear prior data while generating
    setQrDataUrl(null);

    (async () => {
      try {
        const qrcodeMod = await import("qrcode");
        const toDataURL = qrcodeMod.toDataURL || qrcodeMod.default?.toDataURL;
        if (!toDataURL) throw new Error("qrcode.toDataURL not available");
        const dataUrl = await toDataURL(payload, { width: 220, margin: 1 });
        if (!cancelled) setQrDataUrl(dataUrl);
      } catch (e) {
        if (!cancelled) setQrDataUrl(remoteSrc);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shareKey, shareLink]);

  const handleClose = () => {
    setShareLink("");
    setError("");
    setCopied(false);
    setExpiresInDays(1);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose();
      }}
      dismissible={false}
    >
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-white">Share File</DialogTitle>
          <DialogDescription className="text-gray-300">
            Create a secure share link for{" "}
            <strong className="text-white">{filename}</strong>
          </DialogDescription>
        </DialogHeader>

        {!shareLink ? (
          <div className="space-y-4 py-4">
            {/* Expiration */}
            <div className="space-y-2">
              <label
                htmlFor="expires"
                className="flex items-center gap-2 text-sm font-medium text-white"
              >
                <Calendar className="h-4 w-4 text-emerald-400" />
                Expires in (days)
              </label>
              <Input
                id="expires"
                type="number"
                min="1"
                value={expiresInDays}
                max={
                  Number.isFinite(daysRemaining)
                    ? String(daysRemaining)
                    : undefined
                }
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : "";
                  if (v === "") return setExpiresInDays("");
                  // Clamp between 1 and daysRemaining (if finite)
                  const min = 1;
                  const max = Number.isFinite(daysRemaining)
                    ? Math.max(1, daysRemaining)
                    : undefined;
                  if (max !== undefined)
                    setExpiresInDays(Math.min(Math.max(min, v), max));
                  else setExpiresInDays(Math.max(min, v));
                }}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
              <p className="text-xs text-gray-300">
                Link will expire after {expiresInDays || 1} day
                {(expiresInDays || 1) !== 1 ? "s" : ""}
                {Number.isFinite(daysRemaining) && (
                  <span>
                    {" "}
                    — file expires in {daysRemaining} day
                    {daysRemaining !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
              {!Number.isFinite(daysRemaining) || daysRemaining > 0 ? null : (
                <p className="text-xs text-destructive mt-2">
                  This file has expired on Walrus and cannot be shared.
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="text-xs text-gray-300 flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-400" />
              Expires in {expiresInDays || 1} day
              {(expiresInDays || 1) !== 1 ? "s" : ""}
            </div>
            <div className="space-y-2">
              <label
                htmlFor="shareLink"
                className="flex items-center gap-2 text-sm font-medium text-white"
              >
                <LinkIcon className="h-4 w-4 text-emerald-400" />
                Share Link
              </label>
              <div className="flex gap-2">
                <Input
                  id="shareLink"
                  value={shareLink}
                  readOnly
                  className="font-mono text-xs bg-zinc-800 border-zinc-700 text-white"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopyLink}
                  disabled={copied}
                  className="bg-zinc-900 border-zinc-700 hover:bg-zinc-800 text-white shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-300" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-xs text-emerald-400">
                  Link copied to clipboard
                </p>
              )}
              {/* QR preview */}
              <div className="mt-3">
                {(() => {
                  // Use the full share link when present so a scan produces the same URL
                  const qrPayload =
                    shareLink || (shareKey ? `k=${shareKey}` : "");
                  const remoteSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                    qrPayload || "",
                  )}`;
                  const imgSrc = qrDataUrl ?? remoteSrc;
                  return (
                    <img
                      src={imgSrc}
                      alt="Share QR"
                      className="w-36 h-36 rounded-md border border-zinc-700 bg-zinc-900 p-2"
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!shareLink ? (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                className="border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateShare}
                disabled={
                  loading ||
                  (Number.isFinite(daysRemaining) && daysRemaining <= 0)
                }
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Share Link"}
              </Button>
            </>
          ) : (
            <Button
              onClick={handleClose}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50"
            >
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
