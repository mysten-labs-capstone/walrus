import { useState } from 'react';
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
};

export function ShareDialog({ open, onClose, blobId, filename, wrappedFileKey }: ShareDialogProps) {
  const { privateKey } = useAuth();
  const [shareLink, setShareLink] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  
  // Share options
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(1);

  const handleCreateShare = async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      setError('You must be logged in to share files');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create share record on server (NO KEY SENT)
      const daysToExpire = expiresInDays || 1;
      const expiresAt = new Date(Date.now() + daysToExpire * 24 * 60 * 60 * 1000).toISOString();

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
        console.log('[ShareDialog] Unwrapping file key...');
        const fileKey = await unwrapFileKey(wrappedFileKey, kek);
        console.log('[ShareDialog] File key unwrapped successfully');

        const fileKeyBase64url = await exportFileKeyForShare(fileKey);
        console.log('[ShareDialog] File key exported for share, length:', fileKeyBase64url.length);

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
    <Dialog open={open} onOpenChange={handleClose}>
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
                onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : '')}
              />
              <p className="text-xs text-muted-foreground">
                Link will expire after {expiresInDays || 1} day{(expiresInDays || 1) !== 1 ? 's' : ''}
              </p>
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
                disabled={loading}
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
