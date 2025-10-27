import { LockOpen, Shield } from 'lucide-react';
import { useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { downloadBlob } from '../services/walrusApi';
import { decryptWalrusBlob } from '../services/decryptWalrusBlob';

export type UploadedFile = {
  blobId: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function RecentUploads({ items }: { items: UploadedFile[] }) {
  const { privateKey } = useAuth();

  const downloadRaw = useCallback(
    async (blobId: string, name?: string) => {
      const keyToSend = privateKey || ''; // Option 1 requires key even for raw
      const res = await downloadBlob(blobId, keyToSend, name);

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
      const filename = name?.trim() || blobId;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    },
    [privateKey]
  );

  const downloadDecrypted = useCallback(
    async (blobId: string, name?: string) => {
      if (!privateKey) {
        alert('Private key required to decrypt.');
        return;
      }

      const res = await downloadBlob(blobId, privateKey, name);
      if (!res.ok) {
        let detail = 'Download failed';
        try {
          const payload = await res.json();
          detail = payload?.error ?? detail;
        } catch {}
        alert(detail);
        return;
      }

      const encBlob = await res.blob();
      const baseName = (name?.trim() || blobId).replace(/\.[^.]*$/, '');
      const result = await decryptWalrusBlob(encBlob, privateKey, baseName);

      if (!result) {
        alert('This blob is not WALRUS-encrypted or the key is incorrect.');
        return;
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(result.blob);
      a.download = result.suggestedName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    },
    [privateKey]
  );

  if (!items.length) {
    return (
      <section className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-gray-800">Recent Uploads</h2>
        <p className="text-sm text-gray-500">No uploads yet. Upload files to see them here.</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
      <h2 className="text-lg font-semibold text-gray-800">Recent Uploads</h2>
      <div className="space-y-3">
        {items.map((f) => (
          <article key={`${f.blobId}-${f.uploadedAt}`} className="rounded-xl border border-gray-200 p-4">
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-800">{f.name}</p>
                <p className="text-xs text-gray-500">
                  {formatBytes(f.size)} • {f.type || 'unknown type'}
                </p>
              </div>

              <p className="break-all font-mono text-xs text-gray-600">
                Blob ID: {f.blobId}
              </p>

              <div className="flex gap-2">
                {privateKey && (
                  <button
                    type="button"
                    onClick={() => downloadDecrypted(f.blobId, f.name)}
                    className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                  >
                    <LockOpen className="h-4 w-4" /> Download (Decrypted)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => downloadRaw(f.blobId, f.name)}
                  className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  <Shield className="h-4 w-4" /> Download Raw
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
