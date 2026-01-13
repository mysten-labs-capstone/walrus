import { LockOpen, Lock, FileText, Calendar, HardDrive, Loader2, Clock, Copy, Check, Trash2, Download, CalendarPlus, AlertCircle } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { downloadBlob, deleteBlob } from '../services/walrusApi';
import { authService } from '../services/authService';
import { decryptWalrusBlob } from '../services/decryptWalrusBlob';
import { removeCachedFile } from '../lib/fileCache';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { ExtendDurationDialog } from './ExtendDurationDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

export type UploadedFile = {
  blobId: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  uploadedAt: string;
  epochs?: number; // Storage duration in epochs
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RecentUploads({ items, onFileDeleted }: { items: UploadedFile[], onFileDeleted?: () => void }) {
  const { privateKey } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [extendDialogOpen, setExtendDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{ blobId: string; name: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const copyBlobId = useCallback((blobId: string) => {
    navigator.clipboard.writeText(blobId);
    setCopiedId(blobId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const exportAllToTxt = useCallback(() => {
    // Create metadata text content
    const header = `WALRUS BLOB INVENTORY\n`;
    const timestamp = `Generated: ${new Date().toLocaleString()}\n`;
    const separator = `${'='.repeat(80)}\n\n`;

    const calculateExpiryInfo = (uploadedAt: string, epochs: number = 3) => {
      const uploadDate = new Date(uploadedAt);
      const daysPerEpoch = 30;
      const totalDays = epochs * daysPerEpoch;
      const expiryDate = new Date(uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
      const now = new Date();
      const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      
      return {
        expiryDate,
        daysRemaining: Math.max(0, daysRemaining),
      };
    };

    const content = items.map((f, index) => {
      const expiry = calculateExpiryInfo(f.uploadedAt, f.epochs);
      return (
        `[${index + 1}] ${f.name}\n` +
        `    Blob ID: ${f.blobId}\n` +
        `    Size: ${formatBytes(f.size)}\n` +
        `    Type: ${f.type || 'Unknown'}\n` +
        `    Encrypted: ${f.encrypted ? 'Yes' : 'No'}\n` +
        `    Uploaded: ${new Date(f.uploadedAt).toLocaleString()}\n` +
        `    Expires: ${expiry.expiryDate.toLocaleString()} (${expiry.daysRemaining}d remaining)\n` +
        `    Storage Epochs: ${f.epochs || 3}\n` +
        '\n'
      );
    }).join('');

    const summary = (
      `\nSUMMARY\n` +
      `${'='.repeat(80)}\n` +
      `Total Files: ${items.length}\n` +
      `Total Size: ${formatBytes(items.reduce((sum, f) => sum + f.size, 0))}\n` +
      `Encrypted Files: ${items.filter(f => f.encrypted).length}\n` +
      `Unencrypted Files: ${items.filter(f => !f.encrypted).length}\n`
    );

    const fullContent = header + timestamp + separator + content + summary;

    // Create blob and download
    const blob = new Blob([fullContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `walrus-inventory-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [items]);

  const handleDelete = useCallback(
    (blobId: string, fileName: string) => {
      setFileToDelete({ blobId, name: fileName });
      setDeleteDialogOpen(true);
      setDeleteError(null);
    },
    []
  );

  const confirmDelete = useCallback(
    async () => {
      if (!fileToDelete) return;

      setDeletingId(fileToDelete.blobId);
      setDeleteError(null);
      try {
        const user = authService.getCurrentUser();
        if (!user?.id) {
          setDeleteError('You must be logged in to delete files');
          return;
        }

        const res = await deleteBlob(fileToDelete.blobId, user.id);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Delete failed');
        }

        // Remove from localStorage cache
        removeCachedFile(fileToDelete.blobId);
        
        setDeleteDialogOpen(false);
        setFileToDelete(null);
        onFileDeleted?.();
      } catch (err: any) {
        setDeleteError(err.message || 'Failed to delete file');
      } finally {
        setDeletingId(null);
      }
    },
    [fileToDelete, onFileDeleted]
  );

  const downloadFile = useCallback(
    async (blobId: string, name?: string, encrypted?: boolean) => {
      setDownloadingId(blobId);
      try {
        const user = authService.getCurrentUser();
        const res = await downloadBlob(blobId, privateKey || '', name, user?.id);
        if (!res.ok) {
          let detail = 'Download failed';
          try {
            const payload = await res.json();
            detail = payload?.error ?? detail;
          } catch {}
          setDownloadError(detail);
          setTimeout(() => setDownloadError(null), 5000);
          return;
        }

        const blob = await res.blob();

        // If encrypted and we have a private key, try to decrypt
        if (encrypted && privateKey) {
          const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, '');
          const result = await decryptWalrusBlob(blob, privateKey, baseName);

          if (result) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(result.blob);
            a.download = result.suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
            return;
          } else {
            setDownloadError('Decryption failed: The file could not be decrypted with your key. The file may have been encrypted with a different key.');
            setTimeout(() => setDownloadError(null), 5000);
            return;
          }
        }

        // If we have privateKey but file wasn't marked as encrypted,
        // still try decryption (for files uploaded before metadata tracking)
        if (!encrypted && privateKey && blob.size > 0) {
          const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, '');
          const result = await decryptWalrusBlob(blob, privateKey, baseName);
          
          if (result) {
            // Successfully decrypted a file that wasn't marked as encrypted
            const a = document.createElement('a');
            a.href = URL.createObjectURL(result.blob);
            a.download = result.suggestedName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(a.href);
            return;
          }
          // If decryption fails, fall through to download as-is
        }

        // Download as-is if not encrypted or decryption failed
        const filename = name?.trim() || blobId;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      } finally {
        setDownloadingId(null);
      }
    },
    [privateKey]
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const calculateExpiryInfo = (uploadedAt: string, epochs: number = 3) => {
    const uploadDate = new Date(uploadedAt);
    const daysPerEpoch = 30;
    const totalDays = epochs * daysPerEpoch;
    const expiryDate = new Date(uploadDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    
    return {
      expiryDate,
      daysRemaining: Math.max(0, daysRemaining),
      totalDays,
      isExpired: daysRemaining <= 0,
    };
  };

  if (!items.length) {
    return (
      <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            Upload History
          </CardTitle>
          <CardDescription>
            Your recently uploaded files will appear here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
              <HardDrive className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-sm text-muted-foreground">No uploads yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Upload files to see them here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 dark:from-slate-900 dark:to-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
              Upload History
            </CardTitle>
            <CardDescription>
              {items.length} file{items.length !== 1 ? 's' : ''} stored on Walrus
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={exportAllToTxt}
            className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white"
          >
            <Download className="h-4 w-4" />
            Export Metadata
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((f) => (
            <div
              key={`${f.blobId}-${f.uploadedAt}`}
              className="group rounded-xl border border-blue-200/50 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{f.name}</p>
                      {f.encrypted && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <Lock className="h-3 w-3" />
                          Encrypted
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatBytes(f.size)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(f.uploadedAt)}
                      </span>
                      {(() => {
                        const expiry = calculateExpiryInfo(f.uploadedAt, f.epochs);
                        return (
                          <>
                            <span>•</span>
                            <span className={`flex items-center gap-1 ${
                              expiry.isExpired ? 'text-red-600 dark:text-red-400' : 
                              expiry.daysRemaining < 30 ? 'text-orange-600 dark:text-orange-400' : 
                              'text-blue-600 dark:text-blue-400'
                            }`}>
                              <Clock className="h-3 w-3" />
                              {expiry.isExpired ? 'Expired' : `${expiry.daysRemaining}d left`}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg bg-gray-50 p-2 dark:bg-slate-900/50">
                  <p className="flex-1 break-all font-mono text-xs text-gray-600 dark:text-gray-400">
                    {f.blobId}
                  </p>
                  <button
                    onClick={() => copyBlobId(f.blobId)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                    title="Copy Blob ID"
                  >
                    {copiedId === f.blobId ? (
                      <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => downloadFile(f.blobId, f.name, f.encrypted)}
                    disabled={downloadingId === f.blobId || deletingId === f.blobId}
                    className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-70"
                  >
                    {downloadingId === f.blobId ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-3 w-3" />
                        Download
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedFile(f);
                      setExtendDialogOpen(true);
                    }}
                    disabled={downloadingId === f.blobId || deletingId === f.blobId}
                    className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700"
                    title="Extend storage duration"
                  >
                    <CalendarPlus className="mr-2 h-3 w-3" />
                    Extend
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(f.blobId, f.name)}
                    disabled={deletingId === f.blobId || downloadingId === f.blobId}
                    className="bg-red-600 hover:bg-red-700 disabled:opacity-70"
                  >
                    {deletingId === f.blobId ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                      </>
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      
      {/* Extend Duration Dialog */}
      {selectedFile && (
        <ExtendDurationDialog
          open={extendDialogOpen}
          onOpenChange={setExtendDialogOpen}
          blobId={selectedFile.blobId}
          fileName={selectedFile.name}
          fileSize={selectedFile.size}
          currentEpochs={selectedFile.epochs}
          onSuccess={() => {
            // Refresh the upload list
            onFileDeleted?.();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {fileToDelete && (
        <>
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open);
              if (!open) {
                setFileToDelete(null);
                setDeleteError(null);
              }
            }}
            fileName={fileToDelete.name}
            onConfirm={confirmDelete}
          />
          {deleteError && deleteDialogOpen && (
            <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-900 dark:text-red-100">Delete Failed</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">{deleteError}</p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Download Error Notification */}
      {downloadError && (
        <div className="fixed bottom-4 right-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-4 shadow-lg dark:border-red-900 dark:bg-red-900/20 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-900 dark:text-red-100">Download Failed</p>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{downloadError}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
