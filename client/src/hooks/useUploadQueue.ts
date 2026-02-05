import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, set, del } from "idb-keyval";
import { nanoid } from "nanoid";
import { getServerOrigin } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { encryptFile, extractFileIdFromBlob } from "../services/crypto";
import { authService } from "../services/authService";
import { registerFile, findUserRegistry } from "../services/suiContract";

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

      try {
        // Update status to uploading
        // If this is a manual retry after error, reset retry count
        if (meta.status === "error") {
          meta.retryCount = 0; // Reset for manual retry
          meta.retryAfter = undefined;
        }

        meta.status = "uploading";
        meta.progress = 0;
        await saveMeta(userId, meta);
        window.dispatchEvent(new Event("upload-queue-updated"));

        const start = performance.now();
        
        // Extract fileId from encrypted blob if needed
        let fileIdHex: string | undefined;
        if (meta.encrypt) {
          fileIdHex = await extractFileIdFromBlob(blob);
        }
        
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
          // No need to send wrappedFileKey - encryption metadata is in the blob
        }
        
        // Add blockchain fileId for later sync
        if (fileIdHex) {
          form.set("fileId", fileIdHex);
        }

        const uploadUrl = `${getServerOrigin()}/api/upload`;

        // Use XMLHttpRequest for progress tracking with increased timeout for larger files
        // 10MB files need more time: base 60s + 1s per MB
        const fileSizeMB = meta.size / (1024 * 1024);
        const timeoutMs = Math.max(60000, 60000 + fileSizeMB * 1000); // Min 60s, +1s per MB

        let xhrStatus: number | undefined;
        let xhrStatusText: string | undefined;

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
            xhrStatusText = xhr.statusText;
            resolve(
              new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
              }),
            );
          };

          // Network errors (server down, connection refused, CORS blocked, etc.)
          xhr.onerror = (event) => {
            xhrStatus = 0; // Status 0 indicates network error
            const errorMsg =
              xhr.status === 0
                ? "Network error - server may be down or CORS blocked"
                : "Network error - server may be down";
            const error = new Error(errorMsg);
            (error as any).statusCode = 0;
            (error as any).isCorsError = xhr.status === 0 && !xhr.responseText;
            reject(error);
          };

          // Timeout errors
          xhr.ontimeout = () => {
            xhrStatus = 408; // Request Timeout
            const error = new Error(
              `Upload timeout after ${timeoutMs}ms - server may be overloaded`,
            );
            (error as any).statusCode = 408;
            reject(error);
          };

          // Handle aborted requests
          xhr.onabort = () => {
            xhrStatus = 0;
            const error = new Error("Upload aborted");
            (error as any).statusCode = 0;
            reject(error);
          };

          try {
            xhr.send(form);
          } catch (sendErr: any) {
            // CORS or other pre-flight errors
            xhrStatus = 0;
            const error = new Error(
              `Upload failed: ${sendErr?.message || "CORS or network error"}`,
            );
            (error as any).statusCode = 0;
            (error as any).isCorsError = true;
            reject(error);
          }
        }).catch((err: Error) => {
          // Ensure statusCode is set
          if (!(err as any).statusCode) {
            (err as any).statusCode = xhrStatus ?? 0;
          }
          throw err;
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

          // Trigger background job for async uploads with a small delay
          // to stagger multiple queued uploads (prevents overwhelming server)
          if (data.uploadMode === "async" && data.fileId && data.s3Key) {
            // Wait 2 seconds before triggering to space out concurrent uploads
            setTimeout(() => {
              fetch(`${getServerOrigin()}/api/upload/process-async`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  fileId: data.fileId,
                  s3Key: data.s3Key,
                  tempBlobId: blobId,
                  userId: userId,
                  epochs: meta.epochs || 3,
                }),
              }).catch((e) =>
                console.error(
                  "[useUploadQueue] Background job trigger failed:",
                  e,
                ),
              );
            }, 2000);
          }

          if (blobId) {
            const uploadedFile = {
              blobId,
              name: meta.filename,
              size: meta.size,
              type: meta.mimeType,
              encrypted: meta.encrypt,
              uploadedAt: new Date().toISOString(),
              epochs: meta.epochs || 3, // Use actual epochs from metadata
            };

            window.dispatchEvent(
              new CustomEvent("lazy-upload-finished", { detail: uploadedFile }),
            );

            // optional restore cache
            localStorage.setItem(
              "lastUploadedFile",
              JSON.stringify(uploadedFile),
            );
          }

          // Mark as done and refresh UI before removal
          meta.status = "done";
          meta.progress = 100;
          // Clear retry info on success
          meta.retryCount = 0;
          meta.retryAfter = undefined;
          await saveMeta(userId, meta);
          window.dispatchEvent(new Event("upload-queue-updated"));

          // Trigger balance update after successful upload (payment was deducted)
          window.dispatchEvent(new Event("balance-updated"));

          // Show success briefly before removal
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await remove(id);
        } else {
          // Handle non-200 responses
          const statusCode = res.status;
          let errorText = "";
          let errorMessage = "Upload failed";
          let detailedErrorMessage = "Upload failed";

          try {
            errorText = await res.text();
            // Parse error message for logging
            if (errorText) {
              try {
                const errorJson = JSON.parse(errorText);
                detailedErrorMessage = errorJson.error || errorMessage;
              } catch {
                // If not JSON, use the text directly (might be HTML error page)
                detailedErrorMessage =
                  errorText.length > 200
                    ? errorText.substring(0, 200) + "..."
                    : errorText;
              }
            }
          } catch (textErr) {
            // If we can't read the response, use status-based error message
            if (statusCode === 0) {
              detailedErrorMessage =
                "Network error - server may be down or unreachable";
            } else if (statusCode >= 500) {
              detailedErrorMessage = `Server error (${statusCode}) - server may be temporarily unavailable`;
            } else if (statusCode === 408 || statusCode === 504) {
              detailedErrorMessage =
                "Request timeout - server took too long to respond";
            } else {
              detailedErrorMessage = `Upload failed with status ${statusCode}`;
            }
          }

          // Log detailed error to console
          console.error("[useUploadQueue] Upload failed:", {
            filename: meta.filename,
            statusCode,
            detailedError: detailedErrorMessage,
            errorText,
          });

          // Check if we should retry
          const retryCount = meta.retryCount || 0;
          const maxRetries = meta.maxRetries ?? 3;
          const shouldRetry =
            isRetryableError(detailedErrorMessage, statusCode) &&
            retryCount < maxRetries;

          if (shouldRetry) {
            // Schedule automatic retry
            const retryDelay = calculateRetryDelay(retryCount);
            const retryAfter = Date.now() + retryDelay;

            meta.status = "retrying";
            meta.retryCount = retryCount + 1;
            meta.retryAfter = retryAfter;
            meta.error = errorMessage;
            meta.progress = 0;
            // Ensure retry fields are set
            if (meta.maxRetries === undefined) meta.maxRetries = 3;

            await saveMeta(userId, meta);
            // Force multiple refresh events to ensure UI updates
            window.dispatchEvent(new Event("upload-queue-updated"));
            setTimeout(
              () => window.dispatchEvent(new Event("upload-queue-updated")),
              100,
            );
            setTimeout(
              () => window.dispatchEvent(new Event("upload-queue-updated")),
              500,
            );

            // Wait for retry delay, then retry
            setTimeout(async () => {
              const currentMeta = await loadMeta(userId, id);
              if (currentMeta && currentMeta.status === "retrying") {
                await processOne(id);
              }
            }, retryDelay);
          } else {
            // Max retries reached or non-retryable error
            // Reload meta to ensure we have latest state
            const latestMeta = await loadMeta(userId, id);
            if (latestMeta) {
              latestMeta.status = "error";
              latestMeta.error = errorMessage;
              latestMeta.progress = 0;
              // Ensure retry fields are set
              if (latestMeta.maxRetries === undefined)
                latestMeta.maxRetries = 3;
              if (latestMeta.retryCount === undefined)
                latestMeta.retryCount = 0;

              await saveMeta(userId, latestMeta);
              // Force multiple refresh events to ensure UI updates
              window.dispatchEvent(new Event("upload-queue-updated"));
              setTimeout(
                () => window.dispatchEvent(new Event("upload-queue-updated")),
                100,
              );
              setTimeout(
                () => window.dispatchEvent(new Event("upload-queue-updated")),
                500,
              );
            }
          }
        }
      } catch (err: any) {
        // Handle any unexpected errors during upload (network errors, timeouts, CORS, etc.)
        const detailedErrorMessage =
          err?.message || "Upload failed due to an unexpected error";
        const errorMessage = "Upload failed";
        const statusCode = err?.statusCode ?? 0; // Default to 0 for network errors
        const isCorsError =
          err?.isCorsError || detailedErrorMessage.includes("CORS");

        // Log detailed error to console
        console.error("[useUploadQueue] Upload exception:", {
          error: err,
          detailedMessage: detailedErrorMessage,
          statusCode,
          isCorsError,
        });

        // Reload meta to get latest state
        const currentMeta = await loadMeta(userId, id);
        if (!currentMeta) {
          return;
        }

        // Use current meta state
        const retryCount = currentMeta.retryCount || 0;
        const maxRetries = currentMeta.maxRetries ?? 3;
        const shouldRetry =
          isRetryableError(detailedErrorMessage, statusCode) &&
          retryCount < maxRetries;

        if (shouldRetry) {
          // Schedule automatic retry
          const retryDelay = calculateRetryDelay(retryCount);
          const retryAfter = Date.now() + retryDelay;

          currentMeta.status = "retrying";
          currentMeta.retryCount = retryCount + 1;
          currentMeta.retryAfter = retryAfter;
          currentMeta.error = errorMessage;
          currentMeta.progress = 0;
          // Ensure retry fields are set
          if (currentMeta.maxRetries === undefined) currentMeta.maxRetries = 3;

          await saveMeta(userId, currentMeta);
          // Force multiple refresh events to ensure UI updates
          window.dispatchEvent(new Event("upload-queue-updated"));
          setTimeout(
            () => window.dispatchEvent(new Event("upload-queue-updated")),
            100,
          );
          setTimeout(
            () => window.dispatchEvent(new Event("upload-queue-updated")),
            500,
          );

          // Wait for retry delay, then retry
          setTimeout(async () => {
            const latestMeta = await loadMeta(userId, id);
            if (latestMeta && latestMeta.status === "retrying") {
              try {
                await processOne(id);
              } catch (retryErr: any) {
                // Silently handle retry errors - they'll be caught by the outer try/catch
              }
            }
          }, retryDelay);
        } else {
          // Max retries reached or non-retryable error
          currentMeta.status = "error";
          currentMeta.error = errorMessage;
          currentMeta.progress = 0;
          await saveMeta(userId, currentMeta);
          window.dispatchEvent(new Event("upload-queue-updated"));
        }
      }
    },
    [remove, privateKey, userId],
  );

  const processQueue = useCallback(async () => {
    if (busyRef.current || !userId) return;
    busyRef.current = true;
    try {
      const ids = await readList(userId);

      // Filter out files that are retrying (they have their own retry timers)
      const queuedIds: string[] = [];
      for (const id of ids) {
        const meta = await loadMeta(userId, id);
        if (meta && meta.status === "queued") {
          queuedIds.push(id);
        }
      }

      if (queuedIds.length === 0) {
        return;
      }

      // Process files one at a time to minimize CPU usage
      // Render has 1 CPU limit - processing sequentially prevents CPU exhaustion
      const BATCH_SIZE = 1; // Process 1 file at a time to reduce CPU load
      const DELAY_BETWEEN_FILES = 15000; // 15 seconds between files to allow CPU to fully recover
      const DELAY_BETWEEN_BATCHES = 10000; // 10 seconds between batches (not used with batch size 1, but kept for future)

      for (let i = 0; i < queuedIds.length; i += BATCH_SIZE) {
        const batch = queuedIds.slice(i, i + BATCH_SIZE);

        // Process files in this batch with delays
        for (let j = 0; j < batch.length; j++) {
          await processOne(batch[j]);

          // Add delay between files (except after the last file in batch)
          if (j < batch.length - 1) {
            await new Promise((resolve) =>
              setTimeout(resolve, DELAY_BETWEEN_FILES),
            );
          }
        }

        // Add delay between batches (except after the last batch)
        if (i + BATCH_SIZE < queuedIds.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_BATCHES),
          );
        }
      }
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
      updateQueuedEpochs,
      updateItemEpochs,
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
    ],
  );
}
