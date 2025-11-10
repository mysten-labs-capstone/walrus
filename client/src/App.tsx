import { useState, useEffect } from "react";
import { useAuth } from "./auth/AuthContext";
import PrivateKeyGate from "./components/PrivateKeyGate";
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import RecentUploads, { UploadedFile } from "./components/RecentUploads";
import DownloadSection from "./components/DownloadSection";
import UploadQueuePanel from "./components/UploadQueuePanel";
import MetricsTable from "./components/MetricsTable";
import { getServerOrigin } from "./config/api";

console.log("[Client] Resolved API Base:", getServerOrigin());

export default function App() {
  const { isAuthenticated } = useAuth();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    const handleLazyUpload = (e: CustomEvent) => {
      const file = e.detail;
      setUploadedFiles((prev) => [file, ...prev]);
    };
    window.addEventListener("lazy-upload-finished", handleLazyUpload as EventListener);
    return () =>
      window.removeEventListener("lazy-upload-finished", handleLazyUpload as EventListener);
  }, []);

  if (!isAuthenticated) return <PrivateKeyGate />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Walrus Storage</h1>
          </div>
          <p className="text-sm text-gray-600">
            Secure, decentralized file storage powered by Walrus.
          </p>
        </header>

        {/* Logout + Key Info */}
        <SessionSigner />

        {/* Upload Section */}
        <UploadSection
          onUploaded={(f) =>
            setUploadedFiles((prev) => [
              {
                name: f.file.name,
                size: f.file.size,
                type: f.file.type,
                uploadedAt: new Date().toISOString(),
                blobId: f.blobId,
              },
              ...prev,
            ])
          }
        />

        {/* Lazy Upload Queue */}
        <UploadQueuePanel />

        {/* Recent Uploads */}
        <RecentUploads items={uploadedFiles} />

        {/* Download Section */}
        <DownloadSection />

      </div>
    </div>
  );
}
