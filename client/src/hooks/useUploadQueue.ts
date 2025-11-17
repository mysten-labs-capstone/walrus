import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, set, del } from "idb-keyval";
import { nanoid } from "nanoid";
import { getServerOrigin } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { encryptWalrusBlob } from "../scripts/utils/encryptWalrus";

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
};

const LIST_KEY = "upload:list";

async function readList() {
  return (await get(LIST_KEY)) ?? [];
}
async function writeList(ids: string[]) {
  await set(LIST_KEY, ids);
}
async function saveMeta(m: QueuedUpload) {
  await set(`meta:${m.id}`, m);
}
async function loadMeta(id: string) {
  return get<QueuedUpload>(`meta:${id}`);
}
async function deleteMeta(id: string) {
  await del(`meta:${id}`);
}
async function saveBlob(id: string, b: Blob) {
  await set(`blob:${id}`, b);
}
async function loadBlob(id: string) {
  return get<Blob>(`blob:${id}`);
}
async function deleteBlob(id: string) {
  await del(`blob:${id}`);
}

export function useUploadQueue() {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const busyRef = useRef(false);
  const { privateKey } = useAuth();

  const refresh = useCallback(async () => {
    const ids = await readList();
    const metas = await Promise.all(ids.map(loadMeta));
    setItems(metas.filter(Boolean) as QueuedUpload[]);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enqueue = useCallback(
    async (file: File, encrypt: boolean = true) => {
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
      };

      const list = await readList();
      await saveMeta(meta);
      await saveBlob(id, blobToStore);
      await writeList([id, ...list]);

      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
      return id;
    },
    [refresh, privateKey]
  );

  const remove = useCallback(
    async (id: string) => {
      const list: string[] = await readList();
      await writeList(list.filter((x: string) => x !== id));
      await deleteMeta(id);
      await deleteBlob(id);
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    },
    [refresh]
  );

  // ================================================================
  // PROCESS ONE
  // ================================================================
  const processOne = useCallback(
    async (id: string) => {
      const meta = await loadMeta(id);
      const blob = await loadBlob(id);
      if (!meta || !blob) throw new Error("missing data");

      // Update status to uploading
      meta.status = "uploading";
      meta.progress = 0;
      await saveMeta(meta);
      window.dispatchEvent(new Event("upload-queue-updated"));

      const start = performance.now();
      const form = new FormData();
      form.set("file", blob, meta.filename);
      form.set("lazy", "true"); // mark it for metrics only
      form.set("encrypt", meta.encrypt ? "true" : "false");

      const uploadUrl = `${getServerOrigin()}/api/upload`;
      
      // Use XMLHttpRequest for progress tracking
      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadUrl);

        xhr.upload.onprogress = async (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.floor((evt.loaded / evt.total) * 100);
            meta.progress = pct;
            await saveMeta(meta);
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
            epochs: 1, // Default storage duration (changed to 1 for testing)
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
        await saveMeta(meta);
        window.dispatchEvent(new Event("upload-queue-updated"));
        
        // Show success for 5 seconds before removal
        await new Promise(resolve => setTimeout(resolve, 5000));
        await remove(id);
      } else {
        const errorText = await res.text();
        meta.status = "error";
        meta.error = errorText || "Upload failed";
        meta.progress = 0;
        await saveMeta(meta);
        window.dispatchEvent(new Event("upload-queue-updated"));
      }
    },
    [remove]
  );

  const processQueue = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const ids = await readList();
      for (const id of ids) await processOne(id);
    } finally {
      busyRef.current = false;
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    }
  }, [processOne, refresh]);

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
