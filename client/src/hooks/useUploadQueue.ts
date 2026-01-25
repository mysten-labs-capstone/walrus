import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { get, set, del } from "idb-keyval";
import { nanoid } from "nanoid";
import { getServerOrigin } from "../config/api";
import { useAuth } from "../auth/AuthContext";
import { encryptWithPerFileKey } from "../services/crypto";
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
  wrappedFileKey?: string; // E2E encryption - wrapped file key for encrypted files
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
    if (statusCode === 502 || statusCode === 503 || statusCode === 504) return true; // Gateway errors
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
  if (lowerMessage.includes("econnreset") || lowerMessage.includes("etimedout")) return true;
  if (lowerMessage.includes("connection refused")) return true;
  
  // For generic "failed" messages, retry if status code suggests it's transient
  if (lowerMessage.includes("failed") && (statusCode === undefined || statusCode >= 500 || statusCode === 0)) {
    return true;
  }
  
  // Default to retryable for unknown errors (could be transient)
  // This is safer - we'd rather retry and fail than not retry and miss a recoverable error
  return true;
}

// Calculate retry delay with exponential backoff
function calculateRetryDelay(retryCount: number): number {
  // Exponential backoff: 5s, 10s, 20s, 30s (max)
  const baseDelay = 5000; // 5 seconds
  const maxDelay = 30000; // 30 seconds max
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
      let wrappedFileKey: string | undefined;

      if (encrypt && privateKey) {
        try {
          const result = await encryptWithPerFileKey(file, privateKey);
          blobToStore = result.encryptedBlob;
          wrappedFileKey = result.wrappedFileKey;
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
        wrappedFileKey, // Store the wrapped key for later upload
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
          console.log(`[UploadQueue] Manual retry for ${meta.filename}, resetting retry count`);
          meta.retryCount = 0; // Reset for manual retry
          meta.retryAfter = undefined;
        }
        
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
          // Send the wrapped file key for E2E encryption
          if (meta.wrappedFileKey) {
            form.set("wrappedFileKey", meta.wrappedFileKey);
          }
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

          // Network errors (server down, connection refused, etc.)
          xhr.onerror = () => {
            xhrStatus = 0; // Status 0 indicates network error
            reject(new Error("Network error - server may be down"));
          };
          
          // Timeout errors
          xhr.ontimeout = () => {
            xhrStatus = 408; // Request Timeout
            reject(new Error(`Upload timeout after ${timeoutMs}ms - server may be overloaded`));
          };
          
          // Handle aborted requests
          xhr.onabort = () => {
            xhrStatus = 0;
            reject(new Error("Upload aborted"));
          };
          
          xhr.send(form);
        }).catch((err: Error) => {
          // Wrap the error with status code for better detection
          (err as any).statusCode = xhrStatus;
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

          // Show success briefly before removal
          await new Promise((resolve) => setTimeout(resolve, 1000));
          await remove(id);
        } else {
          // Handle non-200 responses
          const statusCode = res.status;
          let errorText = "";
          let errorMessage = "Upload failed";
          
          try {
            errorText = await res.text();
            // Parse error message for better user feedback
            if (errorText) {
              try {
                const errorJson = JSON.parse(errorText);
                errorMessage = errorJson.error || errorMessage;
              } catch {
                // If not JSON, use the text directly (might be HTML error page)
                errorMessage = errorText.length > 200 ? errorText.substring(0, 200) + "..." : errorText;
              }
            }
          } catch (textErr) {
            // If we can't read the response, use status-based error message
            if (statusCode === 0) {
              errorMessage = "Network error - server may be down or unreachable";
            } else if (statusCode >= 500) {
              errorMessage = `Server error (${statusCode}) - server may be temporarily unavailable`;
            } else if (statusCode === 408 || statusCode === 504) {
              errorMessage = "Request timeout - server took too long to respond";
            } else {
              errorMessage = `Upload failed with status ${statusCode}`;
            }
          }

          // Check if we should retry
          const retryCount = (meta.retryCount || 0);
          const maxRetries = meta.maxRetries ?? 3;
          const shouldRetry = isRetryableError(errorMessage, statusCode) && retryCount < maxRetries;
          
          console.log(`[UploadQueue] Upload failed for ${meta.filename}: status=${statusCode}, error="${errorMessage}", retryable=${shouldRetry}, retryCount=${retryCount}/${maxRetries}`);

          if (shouldRetry) {
            // Schedule automatic retry
            const retryDelay = calculateRetryDelay(retryCount);
            const retryAfter = Date.now() + retryDelay;
            
            meta.status = "retrying";
            meta.retryCount = retryCount + 1;
            meta.retryAfter = retryAfter;
            meta.error = errorMessage;
            meta.progress = 0;
            await saveMeta(userId, meta);
            window.dispatchEvent(new Event("upload-queue-updated"));

            console.log(`[UploadQueue] Scheduling retry ${meta.retryCount}/${maxRetries} for ${meta.filename} in ${retryDelay}ms`);
            
            // Wait for retry delay, then retry
            setTimeout(async () => {
              const currentMeta = await loadMeta(userId, id);
              if (currentMeta && currentMeta.status === "retrying") {
                console.log(`[UploadQueue] Retrying upload for ${meta.filename} (attempt ${meta.retryCount})`);
                await processOne(id);
              }
            }, retryDelay);
          } else {
            // Max retries reached or non-retryable error
            meta.status = "error";
            meta.error = errorMessage;
            meta.progress = 0;
            await saveMeta(userId, meta);
            window.dispatchEvent(new Event("upload-queue-updated"));
          }
        }
      } catch (err: any) {
        // Handle any unexpected errors during upload (network errors, timeouts, etc.)
        const errorMessage = err?.message || "Upload failed due to an unexpected error";
        const statusCode = err?.statusCode; // May be set from xhr error handlers
        
        console.log(`[UploadQueue] Exception during upload for ${meta.filename}:`, errorMessage, `statusCode=${statusCode}`);
        
        // Check if we should retry
        const retryCount = (meta.retryCount || 0);
        const maxRetries = meta.maxRetries ?? 3;
        const shouldRetry = isRetryableError(errorMessage, statusCode) && retryCount < maxRetries;

        if (shouldRetry) {
          // Schedule automatic retry
          const retryDelay = calculateRetryDelay(retryCount);
          const retryAfter = Date.now() + retryDelay;
          
          meta.status = "retrying";
          meta.retryCount = retryCount + 1;
          meta.retryAfter = retryAfter;
          meta.error = errorMessage;
          meta.progress = 0;
          await saveMeta(userId, meta);
          window.dispatchEvent(new Event("upload-queue-updated"));

          console.log(`[UploadQueue] Scheduling retry ${meta.retryCount}/${maxRetries} for ${meta.filename} in ${retryDelay}ms`);
          
          // Wait for retry delay, then retry
          setTimeout(async () => {
            const currentMeta = await loadMeta(userId, id);
            if (currentMeta && currentMeta.status === "retrying") {
              console.log(`[UploadQueue] Retrying upload for ${meta.filename} (attempt ${meta.retryCount})`);
              await processOne(id);
            }
          }, retryDelay);
        } else {
          // Max retries reached or non-retryable error
          meta.status = "error";
          meta.error = errorMessage;
          meta.progress = 0;
          await saveMeta(userId, meta);
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
        console.log("[UploadQueue] No queued files to process");
        return;
      }
      
      // Process files in small batches to prevent server memory issues
      // Render has 2GB RAM limit - batching prevents OOM crashes
      const BATCH_SIZE = 3; // Process 3 files at a time
      const DELAY_BETWEEN_FILES = 2000; // 2 seconds between individual files
      const DELAY_BETWEEN_BATCHES = 5000; // 5 seconds between batches
      
      for (let i = 0; i < queuedIds.length; i += BATCH_SIZE) {
        const batch = queuedIds.slice(i, i + BATCH_SIZE);
        console.log(`[UploadQueue] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} files)`);
        
        // Process files in this batch with delays
        for (let j = 0; j < batch.length; j++) {
          await processOne(batch[j]);
          
          // Add delay between files (except after the last file in batch)
          if (j < batch.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_FILES));
          }
        }
        
        // Add delay between batches (except after the last batch)
        if (i + BATCH_SIZE < queuedIds.length) {
          console.log(`[UploadQueue] Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
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
