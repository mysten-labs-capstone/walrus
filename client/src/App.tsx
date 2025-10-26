import { useState } from "react";
import { useAuth } from "./auth/AuthContext";
import PrivateKeyGate from "./components/PrivateKeyGate";
import SessionSigner from "./components/SessionSigner";
import UploadSection from "./components/UploadSection";
import RecentUploads from "./components/RecentUploads";
import DownloadSection from "./components/DownloadSection";

function Shell() {
  const { isAuthenticated } = useAuth();
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  if (!isAuthenticated) {
    return <PrivateKeyGate />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* Header */}
        <header className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Walrus Storage</h1>
          </div>
        </header>

        {/* Logout + Key Info */}
        <SessionSigner />

        {/* Upload Section */}
          <UploadSection
            onUploaded={(file) => setUploadedFiles((prev) => [file, ...prev])}
          />

		{/* Recent Uploads */}
        <RecentUploads items={uploadedFiles} />

        {/* Download Section */}
        <DownloadSection />

      </div>
    </div>
  );
}

export default Shell;
