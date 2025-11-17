import React, { useState, useCallback } from 'react';
import { 
  ConnectButton, 
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient
} from '@mysten/dapp-kit';
import { WalrusClient, WalrusFile } from '@mysten/walrus';
import { Upload, Download, File as FileIcon, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Switch } from './components/ui/switch';

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
  const [encrypt, setEncrypt] = useState(true);

  const walrusClient = new WalrusClient({
    network: 'testnet',
    suiClient,
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  // Upload
  const uploadFile = async (file: File) => {
    if (!currentAccount) {
      alert('Please connect wallet first');
      return;
    }

    setUploading(true);
    try {
      let fileContents: Uint8Array | Blob = file;
      if (encrypt) {
        // We need a private key to encrypt. For now, we'll alert the user.
        // In a real app, you would get this from a secure source.
        alert("Encryption is not fully implemented: Missing private key.");
        // This is where you would call your encryption function, e.g.:
        // fileContents = await encryptToBlob(file, privateKey);
      }

      const walrusFile = WalrusFile.from({
        contents: fileContents,
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
  const downloadFile = async (blobId: string) => {
    setDownloading(true);
    try {
      const bytes = await walrusClient.readBlob({ blobId });
      const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const slicedBuffer = byteArray.buffer.slice(
        byteArray.byteOffset,
        byteArray.byteOffset + byteArray.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([slicedBuffer], { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = 'walrus-download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      alert('File downloaded successfully');
    } catch (err) {
      console.error('Download error:', err);
      const error = err as Error;
      alert('Download failed: ' + error.message);
    } finally {
      setDownloading(false);
    }
  };

  if (!currentAccount) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <div className="bg-slate-800 p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-3xl font-bold mb-4">Walrus</h1>
          <p className="text-slate-400 mb-6">Secure, decentralized file storage on Sui.</p>
          <ConnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Walrus</h1>
          <ConnectButton />
        </header>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="my-files">My Files</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <div className='flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-700 p-12 text-center mt-6' {...getRootProps()}>
              <input {...getInputProps()} />
              <div className='flex flex-col items-center gap-2 text-slate-400'>
                <Upload className='w-12 h-12' />
                {isDragActive ?
                  <p>Drop the files here ...</p> :
                  <p>Drag 'n' drop some files here, or click to select files</p>
                }
              </div>
            </div>
            <div className="flex items-center space-x-2 mt-4">
              <Switch id="encryption-toggle" checked={encrypt} onCheckedChange={setEncrypt} />
              <label htmlFor="encryption-toggle">Encrypt file</label>
            </div>
            {uploading && <p className="mt-4 text-center text-slate-400">Uploading... Please approve transactions in your wallet.</p>}
          </TabsContent>
          <TabsContent value="my-files">
            <div className="bg-slate-800 rounded-lg p-6 mt-6">
              <h2 className="text-xl font-semibold mb-4">My Uploaded Files</h2>
              {uploadedFiles.length > 0 ? (
                <ul className="space-y-4">
                  {uploadedFiles.map((file, idx) => (
                    <li key={idx} className="flex items-center justify-between bg-slate-700 p-4 rounded-lg">
                      <div className="flex items-center gap-4">
                        <FileIcon className='w-6 h-6 text-slate-400' />
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-slate-400 truncate max-w-xs">Blob ID: {file.blobId}</p>
                        </div>
                      </div>
                      <Button onClick={() => downloadFile(file.blobId)} disabled={downloading} size='sm'>
                        <Download className='w-4 h-4 mr-2' />
                        {downloading ? 'Downloading...' : 'Download'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='text-slate-400 text-center py-8'>You haven't uploaded any files yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default WalrusApp;