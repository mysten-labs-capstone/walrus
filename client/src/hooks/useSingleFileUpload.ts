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
      console.log("[useSingleFileUpload] Starting upload:", {
        fileName: file.name,
        fileSize: file.size,
        encrypt,
        hasPrivateKey: !!privateKey,
        paymentAmount,
        epochs,
      });
      
      setState({ file, progress: 0, status: "verifying" });

      try {
        // Server validation (optional but good to keep)
        console.log("[useSingleFileUpload] Verifying file...");
        const validation = await verifyFile(file, privateKey);
        console.log("[useSingleFileUpload] Verification result:", validation);
        
        if (!validation.isValid) {
          throw new Error(validation.errors?.join(", ") || "Validation failed");
        }

        let blobToUpload: Blob = file;
        let encrypted = false;

        if (encrypt) {
          console.log("[useSingleFileUpload] Encrypting file...");
          setState((s) => ({ ...s, status: "encrypting" }));
          blobToUpload = await encryptToBlob(file, privateKey);
          encrypted = true;
          console.log("[useSingleFileUpload] Encryption complete");
        }

        console.log("[useSingleFileUpload] Uploading to Walrus...");
        setState((s) => ({ ...s, status: "uploading", progress: 0 }));

        const user = authService.getCurrentUser();
        
        // Always use async mode (S3 first, then Walrus in background)
        // This provides instant uploads and avoids timeouts
        const uploadMode = "async";
        console.log(`[useSingleFileUpload] Using ASYNC mode for all uploads (epochs: ${epochs}, size: ${file.size})`);
        
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

        console.log("[useSingleFileUpload] Upload response:", resp);

        if (!resp.blobId) throw new Error("No blobId returned");

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
