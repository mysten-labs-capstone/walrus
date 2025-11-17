import { useCallback, useState } from 'react';
import { Loader2, CheckCircle, XCircle, LockOpen, Shield, Download as DownloadIcon, Key } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { downloadBlob, verifyFilePassword } from '../services/walrusApi';
import { decryptWalrusBlob } from '../services/decryptWalrusBlob';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export default function DownloadSection() {
  const { privateKey } = useAuth();
  const [blobId, setBlobId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);
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
      // Verify password if file is protected
      const verification = await verifyFilePassword(blobId, password);
      
      if (verification.isProtected && !verification.isValid) {
        setShowPasswordInput(true);
        throw new Error('Password required or incorrect. Please enter the correct password.');
      }

      // Option 1: raw download also requires privateKey to fetch from Walrus backend
      const res = await downloadBlob(blobId, privateKey || '', name, password);

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
      setPassword(''); // Clear password after successful download
      setShowPasswordInput(false);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoadingRaw(false);
    }
  }, [blobId, name, password, privateKey]);

  const handleDownloadDecrypted = useCallback(async () => {
    if (!blobId.trim()) return setError('Enter a blob ID to download.');
    if (!privateKey) return setError('Private key required to decrypt. Please sign in with your key.');

    setError(null);
    setStatus(null);
    setLoadingDec(true);

    try {
      // Verify password if file is protected
      const verification = await verifyFilePassword(blobId, password);
      
      if (verification.isProtected && !verification.isValid) {
        setShowPasswordInput(true);
        throw new Error('Password required or incorrect. Please enter the correct password.');
      }

      const res = await downloadBlob(blobId, privateKey, name, password);
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
      setPassword(''); // Clear password after successful download
      setShowPasswordInput(false);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoadingDec(false);
    }
  }, [blobId, name, password, privateKey]);

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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 font-mono text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-cyan-400"
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
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-cyan-400"
            />
          </div>
          
          {/* Password Input - Always visible */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              <Key className="h-4 w-4 text-purple-500" />
              Password (If file is protected)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password if required"
              className="w-full rounded-lg border border-purple-300 bg-white px-4 py-3 text-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-purple-600 dark:bg-slate-800 dark:text-white dark:focus:border-purple-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {privateKey && (
            <Button
              onClick={handleDownloadDecrypted}
              disabled={loadingDec}
              className="flex-1 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              {loadingDec ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Decrypting...
                </>
              ) : (
                <>
                  <LockOpen className="mr-2 h-4 w-4" />
                  Download & Decrypt
                </>
              )}
            </Button>
          )}

          <Button
            onClick={handleDownloadRaw}
            disabled={loadingRaw}
            variant="outline"
            className="flex-1 border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:hover:bg-slate-800"
          >
            {loadingRaw ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <Shield className="mr-2 h-4 w-4" />
                Download Raw
              </>
            )}
          </Button>
        </div>

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
