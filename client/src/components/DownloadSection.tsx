import { useCallback, useState } from 'react';
import { Loader2, CheckCircle, XCircle, LockOpen, Shield } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { downloadBlob } from '../services/walrusApi';
import { decryptWalrusBlob } from '../services/decryptWalrusBlob';

export default function DownloadSection() {
  const { privateKey } = useAuth();
  const [blobId, setBlobId] = useState('');
  const [name, setName] = useState('');
  const [loadingDec, setLoadingDec] = useState(false);
  const [loadingRaw, setLoadingRaw] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveBlob = (blob: Blob, filename: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadRaw = useCallback(async () => {
    if (!blobId.trim()) return setError('Enter a blob ID to download.');

    setError(null);
    setStatus(null);
    setLoadingRaw(true);

    try {
      // Option 1: raw download also requires privateKey to fetch from Walrus backend
      const res = await downloadBlob(blobId, privateKey || '', name);

      if (!res.ok) {
        let detail = 'Download failed';
        try {
          const payload = await res.json();
          detail = payload?.error ?? detail;
        } catch {}
        throw new Error(detail);
      }

      const blob = await res.blob();
      const fallbackName = name?.trim() || blobId.trim();
      saveBlob(blob, fallbackName);
      setStatus('Downloaded raw WALRUS blob');
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoadingRaw(false);
    }
  }, [blobId, name, privateKey]);

  const handleDownloadDecrypted = useCallback(async () => {
    if (!blobId.trim()) return setError('Enter a blob ID to download.');
    if (!privateKey) return setError('Private key required to decrypt. Please sign in with your key.');

    setError(null);
    setStatus(null);
    setLoadingDec(true);

    try {
      const res = await downloadBlob(blobId, privateKey, name);
      if (!res.ok) {
        let detail = 'Download failed';
        try {
          const payload = await res.json();
          detail = payload?.error ?? detail;
        } catch {}
        throw new Error(detail);
      }

      const encBlob = await res.blob();
      const baseName = (name?.trim() || blobId.trim()).replace(/\.[^.]*$/, '');
      const result = await decryptWalrusBlob(encBlob, privateKey, baseName);

      if (!result) {
        throw new Error('This blob is not WALRUS-encrypted or the key is incorrect.');
      }

      saveBlob(result.blob, result.suggestedName);
      setStatus(`Decrypted & downloaded as ${result.suggestedName}`);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoadingDec(false);
    }
  }, [blobId, name, privateKey]);

  return (
    <section className="space-y-4 rounded-2xl bg-white p-6 shadow-lg">
      <header className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-800">Download by blob ID</h2>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <input
          type="text"
          value={blobId}
          onChange={(e) => setBlobId(e.target.value)}
          placeholder="Blob ID (example: Aa1Bb2...)"
          className="rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Optional filename"
          className="rounded-lg border border-gray-200 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        {privateKey && (
          <button
            type="button"
            onClick={handleDownloadDecrypted}
            disabled={loadingDec}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loadingDec ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
            {loadingDec ? 'Decrypting...' : 'Download (Decrypted)'}
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadRaw}
          disabled={loadingRaw}
          className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-slate-800 hover:bg-slate-200 disabled:opacity-50"
        >
          {loadingRaw ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
          {loadingRaw ? 'Fetching...' : 'Download Raw'}
        </button>
      </div>

      {status && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {status}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
          <XCircle className="h-4 w-4" /> {error}
        </div>
      )}
    </section>
  );
}
