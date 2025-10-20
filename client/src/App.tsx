import { useState, useCallback, useMemo } from 'react';
import {
  useCurrentAccount,
  ConnectButton,
  useSignAndExecuteTransaction,
  useSuiClient,
} from '@mysten/dapp-kit';
import { WalrusClient, WalrusFile } from '@mysten/walrus';
import { Upload, Download, CheckCircle, XCircle, Loader2, Wallet } from 'lucide-react';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

function validateFile(file: File) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (file.size === 0) errors.push('File is empty');
  else if (file.size > MAX_FILE_SIZE)
    errors.push(`File too large (max 100MB, got ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
  if (file.size > 10 * 1024 * 1024)
    warnings.push(`Large file (${(file.size / 1024 / 1024).toFixed(2)}MB). Upload may take longer.`);
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    fileInfo: { name: file.name, size: file.size, type: file.type || 'unknown' },
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function guessMime(name: string, fallback = 'application/octet-stream') {
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    txt: 'text/plain',
    json: 'application/json',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    zip: 'application/zip',
    csv: 'text/csv',
    md: 'text/markdown',
  };
  return (ext && map[ext]) || fallback;
}

function App() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [downloadBlobId, setDownloadBlobId] = useState('');
  const [downloading, setDownloading] = useState(false);

  const walrusClient = useMemo(
    () =>
      new WalrusClient({
        network: 'testnet',
        suiClient,
        storageNodeClientOptions: {
          timeout: 300_000,
          onError: (err) => {
            const normalErrors = [
              'not been registered',
              'already expired',
              'fetch failed',
              '400',
              'Bad Request',
              'CERT_DATE_INVALID',
            ];
            const isNormal = normalErrors.some(
              (m) => err?.message?.includes(m) || String(err).includes(m),
            );
            if (!isNormal) console.warn('Storage node error:', err);
          },
        },
      }),
    [suiClient],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      if (!currentAccount) {
        alert('Please connect wallet first');
        return;
      }

      const validation = validateFile(file);
      setValidationResult(validation);
      if (!validation.isValid) return;

      setUploading(true);
      setCurrentStep(0);
      const start = Date.now();

      try {
        setUploadProgress('Reading file...');
        const ab = await file.arrayBuffer();
        const bytes = new Uint8Array(ab); // exact payload

        setUploadProgress('Preparing upload...');
        const walrusFile = WalrusFile.from({
          contents: bytes,
          identifier: file.name,
          tags: file.type ? { 'content-type': file.type } : undefined,
        });

        const flow = walrusClient.writeFilesFlow({ files: [walrusFile] });

        await flow.encode();

        const registerTx = flow.register({
          epochs: 3,
          owner: currentAccount.address,
          deletable: true,
        });

        setCurrentStep(1);
        setUploadProgress('APPROVAL 1 OF 2: Reserve Storage Space');
        const registerRes = await signAndExecuteTransaction({ transaction: registerTx });

        setCurrentStep(2);
        setUploadProgress('Uploading file to Walrus network...');
        await flow.upload({ digest: registerRes.digest });

        const certifyTx = flow.certify();
        setCurrentStep(3);
        setUploadProgress('APPROVAL 2 OF 2: Confirm Upload');
        await signAndExecuteTransaction({ transaction: certifyTx });

        const [info] = await flow.listFiles();
        setUploadedFiles((prev) => [
          ...prev,
          {
            blobId: info.blobId,
            name: file.name,
            size: file.size,
            type: file.type || guessMime(file.name),
            uploadedAt: new Date().toISOString(),
          },
        ]);

        setValidationResult(null);
        setUploadProgress('');
        setCurrentStep(0);

        const duration = ((Date.now() - start) / 1000).toFixed(1);
        alert(`Upload successful in ${duration}s!\nBlob ID: ${info.blobId}`);
      } catch (e) {
        console.error('Upload error:', e);
        alert('Upload failed: ' + (e as Error).message);
      } finally {
        setUploading(false);
      }
    },
    [currentAccount, signAndExecuteTransaction, walrusClient],
  );

  // Prefer readFile (Walrus object: {contents, tags, identifier}); fallback to raw blob bytes.
  const downloadFile = useCallback(
    async (blobId: string, fileName: string = 'downloaded-file') => {
      setDownloading(true);
      try {
        if (!blobId) throw new Error('Missing blobId');

        // Try structured API first (0.8.x has this on many builds)
        let contents: Uint8Array | null = null;
        let type: string | undefined;

        try {
          // @ts-ignore - optional at runtime
          if (typeof (walrusClient as any).readFile === 'function') {
            // returns { contents: Uint8Array, tags?: Record<string,string>, identifier?: string }
            const fileObj = await (walrusClient as any).readFile({ blobId });
            if (fileObj && fileObj.contents instanceof Uint8Array) {
              contents = fileObj.contents;
              type = fileObj.tags?.['content-type'];
            }
          }
        } catch (e) {
          console.warn('readFile not available / failed, falling back to readBlob:', e);
        }

        if (!contents) {
          const raw = await walrusClient.readBlob({ blobId });
          const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
          contents = bytes;
        }

        const mime = type || guessMime(fileName, 'application/octet-stream');
        const blob = new Blob([contents.buffer as ArrayBuffer], { type: mime });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setDownloadBlobId('');
      } catch (e) {
        console.error('Download error:', e);
        alert('Download failed: ' + (e as Error).message);
      } finally {
        setDownloading(false);
      }
    },
    [walrusClient],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) uploadFile(file);
    },
    [uploadFile],
  );

  if (!currentAccount) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8 text-indigo-600" />
          </div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2 text-center">Walrus Blob Upload/Download</h1>
          <p className="text-gray-600 mb-6 text-center">Connect your Sui wallet to upload and download files</p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="text-2xl font-bold text-gray-800">Walrus Storage Demo</h1>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-100 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">
                  {currentAccount.address.slice(0, 6)}...{currentAccount.address.slice(-4)}
                </span>
              </div>
              <ConnectButton />
            </div>
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload File
          </h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-indigo-400 transition">
            <input type="file" onChange={handleFileSelect} disabled={uploading} className="hidden" id="file-upload" />
            <label htmlFor="file-upload" className={`cursor-pointer flex flex-col items-center ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploading ? <Loader2 className="w-12 h-12 mb-3 text-indigo-600 animate-spin" /> : <Upload className="w-12 h-12 mb-3 text-gray-400" />}
              <span className="text-gray-600 font-medium">
                {uploading ? uploadProgress : 'Click to upload'}
              </span>
              <span className="text-sm text-gray-500 mt-1">Max 100MB • All file types supported</span>
            </label>
          </div>

          {uploading && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Wallet className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold text-blue-900 mb-3">Upload Progress</p>
                  <div className="space-y-2">
                    <div className={`flex items-center gap-2 ${currentStep >= 1 ? 'text-green-700' : 'text-gray-500'}`}>
                      {currentStep > 1 ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                      <span className="text-sm font-medium">Step 1: Reserve storage space</span>
                    </div>
                    <div className={`flex items-center gap-2 ${currentStep >= 2 ? 'text-blue-700' : 'text-gray-400'}`}>
                      {currentStep > 2 ? <CheckCircle className="w-4 h-4 text-green-700" /> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                      <span className="text-sm font-medium">Step 2: Upload to network</span>
                    </div>
                    <div className={`flex items-center gap-2 ${currentStep >= 3 ? 'text-green-700' : 'text-gray-400'}`}>
                      {currentStep > 3 ? <CheckCircle className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current"></div>}
                      <span className="text-sm font-medium">Step 3: Confirm upload</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!uploading && !validationResult && (
            <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="text-amber-800 text-sm">
                <p className="font-semibold mb-2">REQUIRES 2 WALLET APPROVALS</p>
              </div>
            </div>
          )}

          {validationResult && !uploading && (
            <div className={`mt-4 p-4 rounded-lg ${validationResult.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-3">
                {validationResult.isValid ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-semibold mb-2">{validationResult.fileInfo.name}</p>
                  <p className="text-sm mb-1">Size: {formatBytes(validationResult.fileInfo.size)}</p>
                  {validationResult.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-semibold text-yellow-700">Warnings:</p>
                      {validationResult.warnings.map((w: string, i: number) => (
                        <p key={i} className="text-sm text-yellow-600">• {w}</p>
                      ))}
                    </div>
                  )}
                  {validationResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-semibold text-red-700">Errors:</p>
                      {validationResult.errors.map((er: string, i: number) => (
                        <p key={i} className="text-sm text-red-600">• {er}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Download */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Download className="w-5 h-5" /> Download by Blob ID
          </h2>
          <div className="space-y-3">
            <input
              type="text"
              value={downloadBlobId}
              onChange={(e) => setDownloadBlobId(e.target.value)}
              placeholder="e.g., Aa1Bb2Cc3..."
              disabled={downloading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 font-mono text-sm"
            />
            <button
              onClick={() => downloadFile(downloadBlobId.trim(), 'downloaded-file')}
              disabled={!downloadBlobId.trim() || downloading}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {downloading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download File
                </>
              )}
            </button>
          </div>
        </div>

        {/* Uploaded Files */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Uploaded Files</h2>
            <div className="space-y-3">
              {uploadedFiles.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{file.name}</p>
                    <p className="text-sm text-gray-500">{formatBytes(file.size)}</p>
                    <p className="text-xs text-gray-400 font-mono mt-1">
                      Blob ID: {file.blobId}
                    </p>
                  </div>
                  <button
                    onClick={() => downloadFile(file.blobId, file.name)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
