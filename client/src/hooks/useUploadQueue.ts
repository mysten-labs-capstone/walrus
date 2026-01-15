import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, set, del } from "idb-keyval";
import { nanoid } from "nanoid";
import { getServerOrigin } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { encryptWalrusBlob } from "../scripts/utils/encryptWalrus";
import { authService } from "../services/authService";

export type QueuedUpload = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  status: "queued" | "uploading" | "done" | "error";
  encrypt: boolean;
  progress?: number;
  error?: string;
  paymentAmount?: number; // USD cost for this file
  epochs?: number; // Storage duration in epochs (30-day increments)
};

// User-specific storage keys to prevent queue sharing across accounts
function getListKey(userId: string) {
  return `upload:list:${userId}`;
}
function getMetaKey(userId: string, id: string) {
  return `meta:${userId}:${id}`;
}
function getBlobKey(userId: string, id: string) {
  return `blob:${userId}:${id}`;
}

async function readList(userId: string) {
  return (await get(getListKey(userId))) ?? [];
}
async function writeList(userId: string, ids: string[]) {
  await set(getListKey(userId), ids);
}
async function saveMeta(userId: string, m: QueuedUpload) {
  await set(getMetaKey(userId, m.id), m);
}
async function loadMeta(userId: string, id: string) {
  return get<QueuedUpload>(getMetaKey(userId, id));
}
async function deleteMeta(userId: string, id: string) {
  await del(getMetaKey(userId, id));
}
async function saveBlob(userId: string, id: string, b: Blob) {
  await set(getBlobKey(userId, id), b);
}
async function loadBlob(userId: string, id: string) {
  return get<Blob>(getBlobKey(userId, id));
}
async function deleteBlob(userId: string, id: string) {
  await del(getBlobKey(userId, id));
}

export function useUploadQueue() {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const busyRef = useRef(false);
  const { privateKey } = useAuth();
  const user = authService.getCurrentUser();
  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    const ids = await readList(userId);
    const metas = await Promise.all(ids.map((id: string) => loadMeta(userId, id)));
    setItems(metas.filter(Boolean) as QueuedUpload[]);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enqueue = useCallback(
    async (file: File, encrypt: boolean = true, paymentAmount?: number, epochs?: number) => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const id = nanoid();
      let blobToStore: Blob = file;

      if (encrypt && privateKey) {
        try {
          const arrayBuf = await file.arrayBuffer();
          const { encrypted } = await encryptWalrusBlob(arrayBuf, file.name, privateKey);
          blobToStore = new Blob([encrypted.buffer as ArrayBuffer]);
        } catch (err) {
          console.error("Encryption failed:", err);
        }
      }

      const meta: QueuedUpload = {
        id,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        createdAt: Date.now(),
        status: "queued",
        encrypt,
        paymentAmount,
        epochs,
      };

      const list = await readList(userId);
      await saveMeta(userId, meta);
      await saveBlob(userId, id, blobToStore);
      await writeList(userId, [id, ...list]);

      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
      return id;
    },
    [refresh, privateKey, userId]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!userId) return;
      
      const list: string[] = await readList(userId);
      await writeList(userId, list.filter((x: string) => x !== id));
      await deleteMeta(userId, id);
      await deleteBlob(userId, id);
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    },
    [refresh, userId]
  );

  // ================================================================
  // PROCESS ONE
  // ================================================================
  const processOne = useCallback(
    async (id: string) => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const meta = await loadMeta(userId, id);
      const blob = await loadBlob(userId, id);
      if (!meta || !blob) throw new Error("missing data");

      // Update status to uploading
      meta.status = "uploading";
      meta.progress = 0;
      await saveMeta(userId, meta);
      window.dispatchEvent(new Event("upload-queue-updated"));

      const start = performance.now();
      const form = new FormData();
      form.set("file", blob, meta.filename);
      form.set("lazy", "true"); // mark it for metrics only
      form.set("encrypt", meta.encrypt ? "true" : "false");
      
      // Add userId and userPrivateKey for server-side tracking
      form.set("userId", userId);
      if (privateKey) {
        form.set("userPrivateKey", privateKey);
      }
      
      // Add payment amount if available
      if (meta.paymentAmount !== undefined) {
        form.set("paymentAmount", String(meta.paymentAmount));
      }
      
      // Add storage duration if available
      if (meta.epochs !== undefined) {
        form.set("epochs", String(meta.epochs));
      }
      
      // Tell backend if file is already encrypted (client-side)
      if (meta.encrypt) {
        form.set("clientSideEncrypted", "true");
      }

      const uploadUrl = `${getServerOrigin()}/api/upload`;
      
      // Use XMLHttpRequest for progress tracking
      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);

        xhr.upload.onprogress = async (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.floor((evt.loaded / evt.total) * 100);
            meta.progress = pct;
            await saveMeta(userId, meta);
            window.dispatchEvent(new Event("upload-queue-updated"));
          }
        };

        xhr.onload = () => {
          resolve(new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
          }));
        };

        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(form);
      });

      const end = performance.now();

      // Log Metrics
      await fetch(`${getServerOrigin()}/api/metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "upload",
          filename: meta.filename,
          durationMs: end - start,
          bytes: meta.size,
          ts: Date.now(),
          lazy: true,
          encrypted: meta.encrypt,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const blobId = data.blobId || data.id || data.hash || null;

        if (blobId) {
          const uploadedFile = {
            blobId,
            name: meta.filename,
            size: meta.size,
            type: meta.mimeType,
            encrypted: meta.encrypt,
            uploadedAt: new Date().toISOString(),
            epochs: 3, // Default storage duration
          };

          window.dispatchEvent(
            new CustomEvent("lazy-upload-finished", { detail: uploadedFile })
          );

          // optional restore cache
          localStorage.setItem("lastUploadedFile", JSON.stringify(uploadedFile));
        }

        // Mark as done and refresh UI before removal
        meta.status = "done";
        meta.progress = 100;
        await saveMeta(userId, meta);
        window.dispatchEvent(new Event("upload-queue-updated"));
        
        // Show success briefly before removal
        await new Promise(resolve => setTimeout(resolve, 1000));
        await remove(id);
      } else {
        const errorText = await res.text();
        meta.status = "error";
        meta.error = errorText || "Upload failed";
        meta.progress = 0;
        await saveMeta(userId, meta);
        window.dispatchEvent(new Event("upload-queue-updated"));
      }
    },
    [remove, privateKey, userId]
  );

  const processQueue = useCallback(async () => {
    if (busyRef.current || !userId) return;
    busyRef.current = true;
    try {
      const ids = await readList(userId);
      for (const id of ids) await processOne(id);
    } finally {
      busyRef.current = false;
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    }
  }, [processOne, refresh, userId]);

  return useMemo(
    () => ({
      items,
      enqueue,
      remove,
      processOne,
      processQueue,
      refresh,
    }),
    [items, enqueue, remove, processOne, processQueue, refresh]
  );
}
