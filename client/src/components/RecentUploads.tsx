import { LockOpen, Lock, FileText, Calendar, HardDrive, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { downloadBlob } from '../services/walrusApi';
import { decryptWalrusBlob } from '../services/decryptWalrusBlob';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export type UploadedFile = {
  blobId: string;
  name: string;
  size: number;
  type: string;
  encrypted: boolean;
  uploadedAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RecentUploads({ items }: { items: UploadedFile[] }) {
  const { privateKey } = useAuth();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadFile = useCallback(
    async (blobId: string, name?: string, encrypted?: boolean) => {
      setDownloadingId(blobId);
      try {
        const res = await downloadBlob(blobId, privateKey || '', name);
        if (!res.ok) {
          let detail = 'Download failed';
          try {
            const payload = await res.json();
            detail = payload?.error ?? detail;
          } catch {}
          alert(detail);
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
          }
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
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
          Upload History
        </CardTitle>
        <CardDescription>
          {items.length} file{items.length !== 1 ? 's' : ''} stored on Walrus
        </CardDescription>
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
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatBytes(f.size)}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(f.uploadedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-gray-50 p-2 dark:bg-slate-900/50">
                  <p className="break-all font-mono text-xs text-gray-600 dark:text-gray-400">
                    {f.blobId}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => downloadFile(f.blobId, f.name, f.encrypted)}
                    disabled={downloadingId === f.blobId}
                    className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-70"
                  >
                    {downloadingId === f.blobId ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Downloading...
                      </>
                    ) : (
                      <>
                        <LockOpen className="mr-2 h-3 w-3" />
                        {f.encrypted ? 'Download & Decrypt' : 'Download'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
