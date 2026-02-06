import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, set, del } from "idb-keyval";
import { nanoid } from "nanoid";
import { getServerOrigin } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { encryptFile } from "../services/crypto";
import { authService } from "../services/authService";

export type QueuedUpload = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  status: "queued" | "uploading" | "done" | "error" | "retrying";
  encrypt: boolean;
  progress?: number;
  error?: string;
  paymentAmount?: number; // USD cost for this file
  epochs?: number; // Storage duration in epochs (30-day increments)
  retryCount?: number; // Number of retry attempts
  retryAfter?: number; // Timestamp when retry should happen
  maxRetries?: number; // Maximum retry attempts (default: 3)
  folderId?: string | null; // Folder to upload into
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

// Helper to determine if an error is retryable
function isRetryableError(errorMessage: string, statusCode?: number): boolean {
  // Don't retry permanent errors
  if (errorMessage.includes("Insufficient balance")) return false;
  if (errorMessage.includes("File too large")) return false;
  if (errorMessage.includes("Missing required")) return false;
  if (errorMessage.includes("aborted")) return false;

  // Retry server errors (5xx) and gateway errors
  if (statusCode !== undefined) {
    if (statusCode === 0) return true; // Network error (server down, connection refused)
    if (statusCode >= 500 && statusCode < 600) return true; // Server errors
    if (statusCode === 502 || statusCode === 503 || statusCode === 504)
      return true; // Gateway errors
    if (statusCode === 408) return true; // Request timeout
    if (statusCode === 429) return true; // Too many requests (rate limit)
  }

  // Retry transient errors based on message
  const lowerMessage = errorMessage.toLowerCase();
  if (lowerMessage.includes("timeout")) return true;
  if (lowerMessage.includes("network")) return true;
  if (lowerMessage.includes("server may be down")) return true;
  if (lowerMessage.includes("server may be overloaded")) return true;
  if (lowerMessage.includes("temporarily unavailable")) return true;
  if (lowerMessage.includes("unreachable")) return true;
  if (lowerMessage.includes("econnreset") || lowerMessage.includes("etimedout"))
    return true;
  if (lowerMessage.includes("connection refused")) return true;

  // For generic "failed" messages, retry if status code suggests it's transient
  if (
    lowerMessage.includes("failed") &&
    (statusCode === undefined || statusCode >= 500 || statusCode === 0)
  ) {
    return true;
  }

  // Default to retryable for unknown errors (could be transient)
  // This is safer - we'd rather retry and fail than not retry and miss a recoverable error
  return true;
}

// Calculate retry delay with exponential backoff
function calculateRetryDelay(retryCount: number): number {
  // Exponential backoff: 10s, 20s, 40s, 60s (max)
  // Longer delays to give server more time to recover from CPU exhaustion
  const baseDelay = 10000; // 10 seconds base
  const maxDelay = 60000; // 60 seconds max
  const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
  return delay;
}

export function useUploadQueue() {
  const [items, setItems] = useState<QueuedUpload[]>([]);
  const busyRef = useRef(false);
  const { privateKey } = useAuth();

  // Stabilize userId - only change if the actual ID string changes
  const userId = useMemo(() => {
    const user = authService.getCurrentUser();
    return user?.id;
  }, [authService.getCurrentUser()?.id]);

  const refresh = useCallback(async () => {
    if (!userId) {
      // Don't clear items if userId is temporarily undefined
      // This prevents queue from disappearing during reauth
      return;
    }
    const ids = await readList(userId);
    const metas = await Promise.all(
      ids.map(async (id: string) => {
        const meta = await loadMeta(userId, id);
        if (!meta) return null;

        // Initialize retry fields for old files that don't have them
        // This ensures compatibility with files queued before retry logic was added
        let needsSave = false;
        if (meta.maxRetries === undefined) {
          meta.maxRetries = 3;
          needsSave = true;
        }
        if (meta.retryCount === undefined) {
          meta.retryCount = 0;
          needsSave = true;
        }

        // Fix old files that have error messages but wrong status
        // Some old files might have error messages but status is not "error"
        if (
          meta.error &&
          meta.status !== "error" &&
          meta.status !== "uploading" &&
          meta.status !== "retrying" &&
          meta.status !== "done"
        ) {
          meta.status = "error";
          needsSave = true;
        }

        // Also fix files that are stuck in "uploading" state (likely crashed during upload)
        // If a file has been "uploading" for more than 5 minutes, mark it as error
        if (meta.status === "uploading" && meta.createdAt) {
          const age = Date.now() - meta.createdAt;
          const fiveMinutes = 5 * 60 * 1000;
          if (age > fiveMinutes) {
            meta.status = "error";
            meta.error =
              meta.error || "Upload timed out - server may have crashed";
            needsSave = true;
          }
        }

        if (needsSave) {
          await saveMeta(userId, meta);
        }

        return meta;
      }),
    );
    setItems(metas.filter(Boolean) as QueuedUpload[]);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enqueue = useCallback(
    async (
      file: File,
      encrypt: boolean = true,
      paymentAmount?: number,
      epochs?: number,
      folderId?: string | null,
    ) => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      // Check if encryption is requested but key is missing
      if (encrypt && !privateKey) {
        throw new Error("Encryption key required");
      }

      const id = nanoid();
      let blobToStore: Blob = file;

      if (encrypt && privateKey) {
        try {
          blobToStore = await encryptFile(file, privateKey);
        } catch (err) {
          console.error("Encryption failed:", err);
          throw err;
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
        folderId,
      };

      const list = await readList(userId);
      await saveMeta(userId, meta);
      await saveBlob(userId, id, blobToStore);
      await writeList(userId, [id, ...list]);
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
      return id;
    },
    [refresh, privateKey, userId],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!userId) return;

      const list: string[] = await readList(userId);
      await writeList(
        userId,
        list.filter((x: string) => x !== id),
      );
      await deleteMeta(userId, id);
      await deleteBlob(userId, id);
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    },
    [refresh, userId],
  );

  // ================================================================
  // RETRY ERROR FILES — only retryable errors, respecting max retries
  // ================================================================
  const retryErrorFiles = useCallback(
    async (
      maxRetries: number = 3,
      retryableErrorsOnly: boolean = true,
    ): Promise<number> => {
      if (!userId) return 0;

      const ids = await readList(userId);
      let retriedCount = 0;

      for (const id of ids) {
        const meta = await loadMeta(userId, id);
        if (!meta || meta.status !== "error") continue;

        // Initialize retry fields if missing
        if (meta.maxRetries === undefined) meta.maxRetries = maxRetries;
        if (meta.retryCount === undefined) meta.retryCount = 0;

        // Skip if max retries exceeded
        if (meta.retryCount >= meta.maxRetries) {
          console.log(
            `[useUploadQueue] File "${meta.filename}" max retries (${meta.retryCount}) exceeded`,
          );
          continue;
        }

        // Skip non-retryable errors if filtering enabled
        if (retryableErrorsOnly && !isRetryableError(meta.error || "")) {
          console.log(
            `[useUploadQueue] Skipping non-retryable error for "${meta.filename}": ${meta.error}`,
          );
          continue;
        }

        // Clear error and reset to queued for retry
        meta.status = "queued";
        meta.error = undefined;
        meta.progress = 0;
        meta.retryCount = (meta.retryCount || 0) + 1;
        await saveMeta(userId, meta);
        retriedCount++;

        console.log(
          `[useUploadQueue] Queued retry for "${meta.filename}" (attempt ${meta.retryCount}/${meta.maxRetries})`,
        );
      }

      if (retriedCount > 0) {
        window.dispatchEvent(new Event("upload-queue-updated"));
        await refresh();
      }

      return retriedCount;
    },
    [refresh, userId],
  );

  // ================================================================
  // CLEAR STUCK FILES — reset files stuck in uploading after timeout
  // ================================================================
  const clearStuckFiles = useCallback(
    async (timeoutMs: number = 5 * 60 * 1000): Promise<number> => {
      if (!userId) return 0;

      const ids = await readList(userId);
      let clearedCount = 0;

      for (const id of ids) {
        const meta = await loadMeta(userId, id);
        if (!meta || meta.status !== "uploading") continue;

        const age = Date.now() - meta.createdAt;
        if (age > timeoutMs) {
          meta.status = "error";
          meta.error = `Upload timeout - stuck for ${Math.round(age / 1000)}s`;
          meta.progress = 0;
          await saveMeta(userId, meta);
          clearedCount++;

          console.log(
            `[useUploadQueue] Cleared stuck file: "${meta.filename}"`,
          );
        }
      }

      if (clearedCount > 0) {
        window.dispatchEvent(new Event("upload-queue-updated"));
        await refresh();
      }

      return clearedCount;
    },
    [refresh, userId],
  );

  const updateQueuedEpochs = useCallback(
    async (epochs: number) => {
      if (!userId) return;

      const ids = await readList(userId);
      for (const id of ids) {
        const meta = await loadMeta(userId, id);
        if (meta && meta.status === "queued") {
          meta.epochs = epochs;
          await saveMeta(userId, meta);
        }
      }
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    },
    [refresh, userId],
  );

  const updateItemEpochs = useCallback(
    async (id: string, epochs: number) => {
      if (!userId) return;

      const meta = await loadMeta(userId, id);
      if (meta) {
        meta.epochs = epochs;
        await saveMeta(userId, meta);
        window.dispatchEvent(new Event("upload-queue-updated"));
        await refresh();
      }
    },
    [refresh, userId],
  );

  // ================================================================
  // UPLOAD TO S3 — the client only handles S3 uploads.
  // Walrus decentralization is handled server-side by the
  // trigger-pending cron (sequential, 1 file at a time).
  // ================================================================
  const uploadToS3 = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) {
        throw new Error("User not authenticated");
      }

      const meta = await loadMeta(userId, id);
      const blob = await loadBlob(userId, id);
      if (!meta || !blob) throw new Error("missing data");

      try {
        if (meta.status === "error") {
          meta.retryCount = 0;
          meta.retryAfter = undefined;
        }

        meta.status = "uploading";
        meta.progress = 0;
        await saveMeta(userId, meta);
        window.dispatchEvent(new Event("upload-queue-updated"));

        const start = performance.now();
        const form = new FormData();
        form.set("file", blob, meta.filename);
        form.set("lazy", "true");
        form.set("encrypt", meta.encrypt ? "true" : "false");

        form.set("userId", userId);
        if (privateKey) {
          form.set("userPrivateKey", privateKey);
        }

        if (meta.paymentAmount !== undefined) {
          form.set("paymentAmount", String(meta.paymentAmount));
        }
        if (meta.epochs !== undefined) {
          form.set("epochs", String(meta.epochs));
        }
        if (meta.folderId !== undefined && meta.folderId !== null) {
          form.set("folderId", meta.folderId);
        }
        if (meta.encrypt) {
          form.set("clientSideEncrypted", "true");
        }

        const uploadUrl = `${getServerOrigin()}/api/upload`;

        // Timeout: base 60s + 1s per MB
        const fileSizeMB = meta.size / (1024 * 1024);
        const timeoutMs = Math.max(60000, 60000 + fileSizeMB * 1000);

        let xhrStatus: number | undefined;

        const res = await new Promise<Response>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", uploadUrl);
          xhr.timeout = timeoutMs;

          xhr.upload.onprogress = async (evt) => {
            if (evt.lengthComputable) {
              const pct = Math.floor((evt.loaded / evt.total) * 100);
              meta.progress = pct;
              await saveMeta(userId, meta);
              window.dispatchEvent(new Event("upload-queue-updated"));
            }
          };

          xhr.onload = () => {
            xhrStatus = xhr.status;
            resolve(
              new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
              }),
            );
          };

          xhr.onerror = () => {
            xhrStatus = 0;
            const error = new Error(
              xhr.status === 0
                ? "Network error - server may be down or CORS blocked"
                : "Network error - server may be down",
            );
            (error as any).statusCode = 0;
            reject(error);
          };

          xhr.ontimeout = () => {
            xhrStatus = 408;
            const error = new Error(
              `Upload timeout after ${timeoutMs}ms - server may be overloaded`,
            );
            (error as any).statusCode = 408;
            reject(error);
          };

          xhr.onabort = () => {
            xhrStatus = 0;
            const error = new Error("Upload aborted");
            (error as any).statusCode = 0;
            reject(error);
          };

          try {
            xhr.send(form);
          } catch (sendErr: any) {
            xhrStatus = 0;
            const error = new Error(
              `Upload failed: ${sendErr?.message || "CORS or network error"}`,
            );
            (error as any).statusCode = 0;
            reject(error);
          }
        }).catch((err: Error) => {
          if (!(err as any).statusCode) {
            (err as any).statusCode = xhrStatus ?? 0;
          }
          throw err;
        });

        const end = performance.now();

        // Log metrics (fire-and-forget)
        fetch(`${getServerOrigin()}/api/metrics`, {
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
        }).catch(() => {});

        if (res.ok) {
          const data = await res.json();
          const blobId = data.blobId || data.id || data.hash || null;

          // Dispatch event so file appears in UI immediately
          if (blobId) {
            const uploadedFile = {
              blobId,
              name: meta.filename,
              size: meta.size,
              type: meta.mimeType,
              encrypted: meta.encrypt,
              uploadedAt: new Date().toISOString(),
              epochs: meta.epochs || 3,
              folderId: meta.folderId || null,
              status: "completed" as const,
            };
            window.dispatchEvent(
              new CustomEvent("lazy-upload-finished", { detail: uploadedFile }),
            );
            localStorage.setItem(
              "lastUploadedFile",
              JSON.stringify(uploadedFile),
            );
          }

          // Trigger balance update
          window.dispatchEvent(new Event("balance-updated"));

          // S3 upload succeeded — mark as done.
          // The server's trigger-pending cron will handle Walrus
          // decentralization sequentially (1 file at a time).
          meta.status = "done";
          meta.progress = 100;
          meta.retryCount = 0;
          meta.retryAfter = undefined;
          await saveMeta(userId, meta);
          window.dispatchEvent(new Event("upload-queue-updated"));

          console.log(
            `[useUploadQueue] S3 upload done for "${meta.filename}", server cron will handle Walrus`,
          );

          // Brief success display then remove from client queue
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await remove(id);
          return true;
        } else {
          // S3 upload failed
          const statusCode = res.status;
          let errorMessage = "Upload failed";
          try {
            const errorText = await res.text();
            if (errorText) {
              try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
              } catch {
                errorMessage =
                  errorText.length > 200
                    ? errorText.substring(0, 200) + "..."
                    : errorText;
              }
            }
          } catch {
            if (statusCode >= 500) {
              errorMessage = `Server error (${statusCode})`;
            }
          }

          console.error("[useUploadQueue] Upload failed:", {
            filename: meta.filename,
            statusCode,
            error: errorMessage,
          });

          meta.status = "error";
          meta.error = errorMessage;
          meta.progress = 0;
          await saveMeta(userId, meta);
          window.dispatchEvent(new Event("upload-queue-updated"));
          return false;
        }
      } catch (err: any) {
        const errorMessage =
          err?.message || "Upload failed due to an unexpected error";

        console.error("[useUploadQueue] Upload exception:", {
          error: err,
          message: errorMessage,
        });

        const currentMeta = await loadMeta(userId, id);
        if (currentMeta) {
          currentMeta.status = "error";
          currentMeta.error = errorMessage;
          currentMeta.progress = 0;
          await saveMeta(userId, currentMeta);
          window.dispatchEvent(new Event("upload-queue-updated"));
        }
        return false;
      }
    },
    [remove, privateKey, userId],
  );

  // ================================================================
  // PROCESS ONE (manual single-file upload to S3)
  // ================================================================
  const processOne = useCallback(
    async (id: string) => {
      if (!userId) throw new Error("User not authenticated");
      await uploadToS3(id);
    },
    [uploadToS3, userId],
  );

  // ================================================================
  // PROCESS QUEUE — S3 uploads staggered 5s apart.
  // Smart ordering: small files first (reduce server load during Walrus).
  // Failed files are skipped to prevent blocking the queue.
  // Server's trigger-pending cron handles Walrus uploads sequentially.
  // ================================================================
  const processQueue = useCallback(async () => {
    if (busyRef.current || !userId) return;
    busyRef.current = true;

    try {
      const ids = await readList(userId);
      const S3_DELAY = 5000; // 5 seconds between S3 uploads

      const queuedIds: string[] = [];
      const errorIds: string[] = [];
      const queuedMetadata: Array<{ id: string; meta: QueuedUpload }> = [];

      for (const id of ids) {
        const meta = await loadMeta(userId, id);
        if (!meta) continue;

        if (meta.status === "queued") {
          queuedIds.push(id);
          queuedMetadata.push({ id, meta });
        } else if (meta.status === "error") {
          errorIds.push(id);
        }
      }

      if (queuedIds.length === 0) {
        // Optionally log error files that are blocking (for debugging)
        if (errorIds.length > 0) {
          console.log(
            `[useUploadQueue] Queue empty. ${errorIds.length} error file(s) present.`,
          );
        }
        return;
      }

      // Sort by file size (small first) to reduce server load during Walrus uploads
      queuedMetadata.sort((a, b) => a.meta.size - b.meta.size);

      console.log(
        `[useUploadQueue] Processing ${queuedMetadata.length} file(s) — S3 upload, 5s apart`,
      );
      console.log(
        `[useUploadQueue] Upload order (smallest first):`,
        queuedMetadata.map((x) => `${x.meta.filename} (${x.meta.size} bytes)`),
      );

      for (let i = 0; i < queuedMetadata.length; i++) {
        const { id, meta } = queuedMetadata[i];
        console.log(
          `[useUploadQueue] S3 upload ${i + 1}/${queuedMetadata.length}: "${meta.filename}" (${meta.size} bytes)`,
        );

        const result = await uploadToS3(id);

        // If upload failed, log it but continue with next file
        if (!result) {
          console.warn(
            `[useUploadQueue] Upload failed for "${meta.filename}", continuing with queue`,
          );
        }

        // 5s delay between S3 uploads (except after the last one)
        if (i < queuedMetadata.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, S3_DELAY));
        }
      }

      console.log(
        "[useUploadQueue] All S3 uploads complete. Server cron will handle Walrus sequentially.",
      );
    } finally {
      busyRef.current = false;
      window.dispatchEvent(new Event("upload-queue-updated"));
      await refresh();
    }
  }, [uploadToS3, refresh, userId]);

  return useMemo(
    () => ({
      items,
      enqueue,
      remove,
      processOne,
      processQueue,
      refresh,
      updateQueuedEpochs,
      updateItemEpochs,
      retryErrorFiles,
      clearStuckFiles,
    }),
    [
      items,
      enqueue,
      remove,
      processOne,
      processQueue,
      refresh,
      updateQueuedEpochs,
      updateItemEpochs,
      retryErrorFiles,
      clearStuckFiles,
    ],
  );
}
