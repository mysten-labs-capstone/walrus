import { useState } from 'react';
import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Calendar, Copy, Check, Link as LinkIcon, Clock } from 'lucide-react';
import { apiUrl } from '../config/api';
import { useAuth } from '../auth/AuthContext';
import { authService } from '../services/authService';
import { exportFileKeyForShare } from '../services/crypto';

type ShareDialogProps = {
  open: boolean;
  onClose: () => void;
  blobId: string;
  filename: string;
  wrappedFileKey: string | null;
  uploadedAt?: string;
  epochs?: number;
};

export function ShareDialog({ open, onClose, blobId, filename, wrappedFileKey, uploadedAt, epochs }: ShareDialogProps) {
  const { privateKey } = useAuth();
  const [shareLink, setShareLink] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // Share options
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(1);

  // Compute remaining lifetime for the file (days). Epochs are 14-day increments.
  const daysPerEpoch = 14;
  const calculateExpiryInfo = (uploadedAt: string | undefined, epochs: number | undefined) => {
    if (!uploadedAt) return { expiryDate: null as Date | null, daysRemaining: Infinity };
    const uploadDate = new Date(uploadedAt);
    const totalDays = (epochs ?? 3) * daysPerEpoch;
    const expiryDate = new Date(uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    return { expiryDate, daysRemaining: Math.max(0, daysRemaining) };
  };

  const { daysRemaining } = calculateExpiryInfo(uploadedAt, epochs);

  const handleCreateShare = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      setError('You must be logged in to share files');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Validate expiration days
      if (expiresInDays !== '' && Number(expiresInDays) < 1) {
        setError('Expiration must be 1 day or greater');
        setLoading(false);
        return;
      }

      // Ensure we don't create a share longer than the file's remaining lifetime
      if (Number.isFinite(daysRemaining) && daysRemaining <= 0) {
        setError('This file has expired on Walrus and cannot be shared');
        setLoading(false);
        return;
      }

      // Create share record on server (NO KEY SENT)
      const daysToExpire = expiresInDays || 1;
      if (Number.isFinite(daysRemaining) && Number(daysToExpire) > daysRemaining) {
        setError(`Expiration cannot exceed file lifetime (${daysRemaining} days)`);
        setLoading(false);
        return;
      }
      const expiresAt = new Date(Date.now() + Number(daysToExpire) * 24 * 60 * 60 * 1000).toISOString();

      const response = await fetch(apiUrl('/api/shares'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobId,
          userId: user.id,
          expiresAt,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create share');
      }

      const { shareId } = await response.json();
      const baseUrl = window.location.origin;

      // If file is encrypted, export the per-file key and append as fragment.
      if (wrappedFileKey) {
        if (!privateKey) throw new Error('Private key required to export file key for encrypted file');

        // Unwrap + export
        const { deriveKEK, unwrapFileKey } = await import('../services/fileKeyManagement');
        const kek = await deriveKEK(privateKey);
        const fileKey = await unwrapFileKey(wrappedFileKey, kek);
        const fileKeyBase64url = await exportFileKeyForShare(fileKey);
        const link = `${baseUrl}/s/${shareId}#k=${fileKeyBase64url}`;
        setShareLink(link);
        // Auto-copy to clipboard for smoother UX
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn('[ShareDialog] Auto-copy failed', err);
        }
      } else {
        // Unencrypted file: share link contains no embedded key
        const link = `${baseUrl}/s/${shareId}`;
        setShareLink(link);
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch (err) {
          console.warn('[ShareDialog] Auto-copy failed', err);
        }
      }
    } catch (err: any) {
      console.error('[ShareDialog] Error creating share:', err);
      setError(err.message || 'Failed to create share link');
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
      console.error('Failed to copy:', err);
    }
  };

  const handleClose = () => {
    setShareLink('');
    setError('');
    setCopied(false);
    setExpiresInDays(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }} dismissible={false}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share File</DialogTitle>
          <DialogDescription>
            Create a secure share link for <strong>{filename}</strong>
          </DialogDescription>
        </DialogHeader>

        {!shareLink ? (
          <div className="space-y-4 py-4">
            {/* Expiration */}
            <div className="space-y-2">
              <label htmlFor="expires" className="flex items-center gap-2 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                Expires in (days)
              </label>
              <Input
                id="expires"
                type="number"
                min="1"
                value={expiresInDays}
                max={Number.isFinite(daysRemaining) ? String(daysRemaining) : undefined}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : '';
                  if (v === '') return setExpiresInDays('');
                  // Clamp between 1 and daysRemaining (if finite)
                  const min = 1;
                  const max = Number.isFinite(daysRemaining) ? Math.max(1, daysRemaining) : undefined;
                  if (max !== undefined) setExpiresInDays(Math.min(Math.max(min, v), max));
                  else setExpiresInDays(Math.max(min, v));
                }}
              />
              <p className="text-xs text-muted-foreground">
                Link will expire after {expiresInDays || 1} day{(expiresInDays || 1) !== 1 ? 's' : ''}
                {Number.isFinite(daysRemaining) && (
                  <span> — file expires in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span>
                )}
              </p>
              {!Number.isFinite(daysRemaining) || daysRemaining > 0 ? null : (
                <p className="text-xs text-destructive mt-2">This file has expired on Walrus and cannot be shared.</p>
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
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Expires in {expiresInDays || 1} day{(expiresInDays || 1) !== 1 ? 's' : ''}
            </div>
            <div className="space-y-2">
              <label htmlFor="shareLink" className="flex items-center gap-2 text-sm font-medium">
                <LinkIcon className="h-4 w-4" />
                Share Link
              </label>
              <div className="flex gap-2">
                <Input
                  id="shareLink"
                  value={shareLink}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopyLink}
                  disabled={copied}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
                  {copied && (
                    <p className="text-xs text-green-600">Link copied to clipboard</p>
                  )}
            </div>
          </div>
        )}

        <DialogFooter>
          {!shareLink ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateShare}
                disabled={loading || (Number.isFinite(daysRemaining) && daysRemaining <= 0)}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Share Link'}
              </Button>
            </>
          ) : (
                <Button
                  onClick={handleClose}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50"
                >
                  Close
                </Button>
              )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
