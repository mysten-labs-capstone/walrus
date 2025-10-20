import React, { useState } from 'react';
import { 
  ConnectButton, 
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient
} from '@mysten/dapp-kit';
import { WalrusClient, WalrusFile } from '@mysten/walrus';
import { Upload, Download } from 'lucide-react';

interface UploadedFile {
  blobId: string;
  name: string;
  size: number;
  type: string;
}

function WalrusApp() {
  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const suiClient = useSuiClient();

  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [blobIdInput, setBlobIdInput] = useState('');

  const walrusClient = new WalrusClient({
    network: 'testnet',
    suiClient,
  });

  // Upload
  const uploadFile = async (file: File) => {
    if (!currentAccount) {
      alert('Please connect wallet first');
      return;
    }

    setUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const fileData = new Uint8Array(arrayBuffer);

      const walrusFile = WalrusFile.from({
        contents: fileData,
        identifier: file.name,
        tags: { 'content-type': file.type },
      });

      const flow = walrusClient.writeFilesFlow({ files: [walrusFile] });
      await flow.encode();

      const registerTx = flow.register({
        epochs: 3,
        owner: currentAccount.address,
        deletable: true,
      });

      const registerResult = await signAndExecuteTransaction({
        transaction: registerTx,
      });

      await flow.upload({ digest: registerResult.digest });

      const certifyTx = flow.certify();
      await signAndExecuteTransaction({ transaction: certifyTx });

      const files = await flow.listFiles();

      const newFile: UploadedFile = {
        blobId: files[0].blobId,
        name: file.name,
        size: file.size,
        type: file.type,
      };

      setUploadedFiles(prev => [...prev, newFile]);

      alert(`Upload successful!\nBlob ID: ${files[0].blobId}`);
    } catch (err) {
      console.error('Upload error:', err);
      const error = err as Error;
      alert('Upload failed: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  // Download
  const downloadFile = async () => {
    if (!blobIdInput.trim()) {
      alert('Please enter a Blob ID');
      return;
    }

    setDownloading(true);
    try {
      const bytes = await walrusClient.readBlob({ blobId: blobIdInput.trim() });
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'walrus-download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      alert('File downloaded successfully');
      setBlobIdInput('');
    } catch (err) {
      console.error('Download error:', err);
      const error = err as Error;
      alert('Download failed: ' + error.message);
    } finally {
      setDownloading(false);
    }
  };

  // UI
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  if (!currentAccount) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-2xl font-bold mb-4">Walrus Storage</h1>
          <p className="text-gray-600 mb-6">Connect your Sui wallet to get started</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Walrus Storage</h1>
            <ConnectButton />
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Upload size={20} /> Upload File
          </h2>
          <input
            type="file"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
          />
          {uploading && <p className="mt-2 text-sm text-gray-600">Uploading... Please approve transactions in your wallet</p>}
        </div>

        {/* Download Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Download size={20} /> Download by Blob ID
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter Blob ID"
              value={blobIdInput}
              onChange={(e) => setBlobIdInput(e.target.value)}
              className="flex-grow border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={downloadFile}
              disabled={downloading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:bg-gray-400"
            >
              {downloading ? 'Downloading...' : 'Download'}
            </button>
          </div>
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
            {uploadedFiles.map((file, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-lg mb-2">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-gray-500">Blob ID: {file.blobId}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default WalrusApp;