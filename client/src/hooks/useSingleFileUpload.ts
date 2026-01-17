import { useCallback, useState } from "react";
import { verifyFile, uploadBlob } from "../services/walrusApi";
import { encryptToBlob } from "../services/crypto";
import { authService } from "../services/authService";

export type UploadState = {
  file: File | null;
  progress: number;
  status: "idle" | "verifying" | "encrypting" | "uploading" | "done" | "error";
  error?: string;
};

export function useSingleFileUpload(
  onUploaded?: (file: { blobId: string; file: File; encrypted: boolean; epochs?: number }) => void
) {
  const [state, setState] = useState<UploadState>({
    file: null,
    progress: 0,
    status: "idle",
  });

  const reset = useCallback(() => {
    setState({ file: null, progress: 0, status: "idle" });
  }, []);

  const startUpload = useCallback(
    async (file: File, privateKey: string, encrypt: boolean, paymentAmount?: number, epochs?: number) => {
      setState({ file, progress: 0, status: "verifying" });

      try {
        // Server validation (optional but good to keep)
        const validation = await verifyFile(file, privateKey);

        if (!validation.isValid) {
          throw new Error(validation.errors?.join(", ") || "Validation failed");
        }

        let blobToUpload: Blob = file;
        let encrypted = false;

        if (encrypt) {
          setState((s) => ({ ...s, status: "encrypting" }));
          blobToUpload = await encryptToBlob(file, privateKey);
          encrypted = true;
        }

        setState((s) => ({ ...s, status: "uploading", progress: 0 }));

        const user = authService.getCurrentUser();
        
        // Always use async mode (S3 first, then Walrus in background)
        // This provides instant uploads and avoids timeouts
        const uploadMode = "async";
        // Old logic (commented for future reference):
        // const shouldUseAsyncMode = (epochs && epochs > 5) || (file.size > 5 * 1024 * 1024);
        // const uploadMode = shouldUseAsyncMode ? "async" : "sync";
        
        const resp = await uploadBlob(
          blobToUpload,
          privateKey,
          (pct) => setState((s) => ({ ...s, progress: pct })),
          undefined, // signal
          user?.id, // userId
          false, // encryptOnServer - false since we encrypt client-side
          file.name, // original filename
          paymentAmount, // payment amount in USD
          encrypted, // clientSideEncrypted - tell backend file was encrypted on client
          epochs, // storage duration in epochs
          uploadMode // "async" for fast S3 upload, "sync" for traditional
        );

        
        if (!resp.blobId) throw new Error("No blobId returned");

        // If async mode and we got a fileId, trigger background job from client as fallback
        if (uploadMode === "async" && resp.fileId && resp.s3Key) {
          console.log(`[useSingleFileUpload] Triggering background job for fileId: ${resp.fileId}`);
          const apiBase = import.meta.env.VITE_SERVER_URL || 'https://walrus-jpfl.onrender.com';
          fetch(`${apiBase}/api/upload/process-async`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileId: resp.fileId,
              s3Key: resp.s3Key,
              tempBlobId: resp.blobId,
              userId: user?.id,
              epochs: epochs || 3,
            }),
          }).catch(e => console.error('[useSingleFileUpload] Background job trigger failed:', e));
        }

        setState((s) => ({ ...s, status: "done", progress: 100 }));
        onUploaded?.({ blobId: resp.blobId, file, encrypted, epochs });
      } catch (err: any) {
        console.error("[useSingleFileUpload] Upload error:", err);
        setState((s) => ({
          ...s,
          file: null,
          status: "error",
          error: err?.message || String(err),
        }));
      }
    },
    [onUploaded]
  );

  return { state, startUpload, reset };
}
