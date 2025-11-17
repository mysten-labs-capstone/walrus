import { useCallback, useState } from "react";
import { verifyFile, uploadBlob } from "../services/walrusApi";
import { encryptToBlob } from "../services/crypto";

export type UploadState = {
  file: File | null;
  progress: number;
  status: "idle" | "verifying" | "encrypting" | "uploading" | "done" | "error";
  error?: string;
};

export function useSingleFileUpload(
  onUploaded?: (file: { blobId: string; file: File; encrypted: boolean }) => void
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
    async (file: File, privateKey: string, encrypt: boolean) => {
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

        const resp = await uploadBlob(
          blobToUpload,
          privateKey,
          (pct) => setState((s) => ({ ...s, progress: pct }))
        );

        if (!resp.blobId) throw new Error("No blobId returned");

        setState((s) => ({ ...s, status: "done", progress: 100 }));
        onUploaded?.({ blobId: resp.blobId, file, encrypted });
      } catch (err: any) {
        // On any failure (validation, encryption, or upload) clear the
        // transient `file` state so the UI can show a standalone error
        // message. This also makes tests deterministic since some mocks
        // exercise early validation failures.
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
