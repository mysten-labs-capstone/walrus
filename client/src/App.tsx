import { useState, useEffect } from "react";
import { useAuth } from "./auth/AuthContext"; 
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import RecentUploads, { UploadedFile } from "./components/RecentUploads";
import DownloadSection from "./components/DownloadSection";
import UploadQueuePanel from "./components/UploadQueuePanel";
import { getServerOrigin } from "./config/api";
import { authService } from "./services/authService";

console.log("[Client] Resolved API Base:", getServerOrigin());

export default function App() {
  const { isAuthenticated } = useAuth(); 
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const user = authService.getCurrentUser();

  useEffect(() => {
    const handleLazyUpload = (e: CustomEvent) => {
      const file = e.detail;
      setUploadedFiles((prev) => [file, ...prev]);
    };
    window.addEventListener("lazy-upload-finished", handleLazyUpload as EventListener);
    return () =>
      window.removeEventListener("lazy-upload-finished", handleLazyUpload as EventListener);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">

        <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Walrus Storage</h1>
            {user && (
              <span className="ml-auto text-sm text-gray-600">
                Logged in as <strong>{user.username}</strong>
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            Secure, decentralized file storage powered by Walrus.
          </p>
          {!isAuthenticated && (
            <p className="text-xs text-amber-600">
              ⚠️ Enter a private key in "Session signer" below to enable file encryption
            </p>
          )}
        </header>

        <SessionSigner />
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
        <UploadQueuePanel />
        <RecentUploads items={uploadedFiles} />
        <DownloadSection />
      </div>
    </div>
  );
}