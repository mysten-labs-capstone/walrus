import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../auth/AuthContext";
import { authService } from "../services/authService";
import {
  registerFile,
  findUserRegistry,
  createRegistry,
  getUserFiles,
} from "../services/suiContract";
import { getServerOrigin } from "../config/api";

function getCachedRegistryId(suiAddress: string): string | null {
  const key = `blockchain_registry_${suiAddress}`;
  return localStorage.getItem(key);
}

function setCachedRegistryId(suiAddress: string, registryId: string): void {
  const key = `blockchain_registry_${suiAddress}`;
  localStorage.setItem(key, registryId);
}

export function useBlockchainSync() {
  const { privateKey, suiAddress, isAuthenticated } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const syncInProgressRef = useRef(false);
  const pendingFilesRef = useRef<Map<string, any>>(new Map());
  const registryIdRef = useRef<string | null>(null);
  const blockchainFileIdsRef = useRef<Set<string> | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    total: number;
    synced: number;
    failed: number;
  }>({ total: 0, synced: 0, failed: 0 });

  const setSyncing = (value: boolean) => {
    syncInProgressRef.current = value;
    setIsSyncing(value);
  };

  const ensureRegistryId = useCallback(async () => {
    if (!privateKey || !suiAddress) return null;

    if (registryIdRef.current) {
      return registryIdRef.current;
    }

    let registryId = getCachedRegistryId(suiAddress);
    if (!registryId) {
      registryId = await findUserRegistry(suiAddress);
    }

    if (!registryId) {
      const cleanHex = privateKey.replace(/^0x/, "");
      const masterKeyBytes = new Uint8Array(
        cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
      );
      registryId = await createRegistry(
        masterKeyBytes,
        import.meta.env.VITE_SUI_EXPORTED_PRIVATE_KEY,
      );
      setCachedRegistryId(suiAddress, registryId);
    } else if (!getCachedRegistryId(suiAddress)) {
      setCachedRegistryId(suiAddress, registryId);
    }

    registryIdRef.current = registryId;
    return registryId;
  }, [privateKey, suiAddress]);

  const ensureBlockchainFileIds = useCallback(async (registryId: string) => {
    if (!blockchainFileIdsRef.current) {
      const blockchainFiles = await getUserFiles(registryId);
      blockchainFileIdsRef.current = new Set(
        blockchainFiles.map((f: any) => {
          const fileId = f.fileId;
          if (Array.isArray(fileId)) {
            return Buffer.from(fileId).toString("hex");
          }
          return fileId;
        }),
      );
    }
    return blockchainFileIdsRef.current;
  }, []);

  const syncFiles = useCallback(
    async (files: any[]) => {
      if (!isAuthenticated || !privateKey || !suiAddress) {
        return;
      }

      if (syncInProgressRef.current) {
        return;
      }

      if (!files || files.length === 0) {
        return;
      }

      setSyncing(true);
      setSyncStatus({ total: files.length, synced: 0, failed: 0 });

      try {
        const registryId = await ensureRegistryId();
        if (!registryId) {
          throw new Error("Registry not available");
        }

        const blockchainFileIds = await ensureBlockchainFileIds(registryId);

        const cleanHex = privateKey.replace(/^0x/, "");
        const masterKeyBytes = new Uint8Array(
          cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
        );

        let synced = 0;
        let failed = 0;

        for (const file of files) {
          if (file.fileId && blockchainFileIds.has(file.fileId)) {
            continue;
          }

          try {
            if (!file.fileId) {
              console.warn(
                `[useBlockchainSync] Skipping ${file.filename} - no fileId in database`,
              );
              failed++;
              continue;
            }

            await registerFile(
              masterKeyBytes,
              registryId,
              file.fileId,
              file.blobId,
              true,
              file.epochs || 3,
              import.meta.env.VITE_SUI_EXPORTED_PRIVATE_KEY,
            );

            synced++;
            blockchainFileIds.add(file.fileId);
            setSyncStatus({ total: files.length, synced, failed });
          } catch (err) {
            console.error(
              `[useBlockchainSync] Failed to register ${file.filename}:`,
              err,
            );
            failed++;
            setSyncStatus({ total: files.length, synced, failed });
          }
        }
      } catch (error) {
        console.error("[useBlockchainSync] Sync failed:", error);
      } finally {
        setSyncing(false);
        if (pendingFilesRef.current.size > 0) {
          const pending = Array.from(pendingFilesRef.current.values());
          pendingFilesRef.current.clear();
          void syncFiles(pending);
        }
      }
    },
    [
      ensureBlockchainFileIds,
      ensureRegistryId,
      isAuthenticated,
      privateKey,
      suiAddress,
    ],
  );

  const queueFiles = useCallback(
    (files: any[]) => {
      if (!files || files.length === 0) return;
      for (const file of files) {
        if (!file?.id) continue;
        pendingFilesRef.current.set(file.id, file);
      }
      if (!syncInProgressRef.current) {
        const pending = Array.from(pendingFilesRef.current.values());
        pendingFilesRef.current.clear();
        void syncFiles(pending);
      }
    },
    [syncFiles],
  );

  const syncBlockchain = useCallback(async () => {
    const user = authService.getCurrentUser();
    if (!user) {
      return;
    }

    try {
      const response = await fetch(
        `${getServerOrigin()}/api/files/completed?userId=${user.id}`,
      );

      if (!response.ok) {
        throw new Error("Failed to fetch completed files");
      }

      const { files } = await response.json();
      queueFiles(files || []);
    } catch (error) {
      console.error("[useBlockchainSync] Manual sync failed:", error);
    }
  }, [queueFiles]);

  useEffect(() => {
    registryIdRef.current = null;
    blockchainFileIdsRef.current = null;
    pendingFilesRef.current.clear();
  }, [isAuthenticated, suiAddress]);

  // SSE stream for completed uploads (replaces polling)
  useEffect(() => {
    if (!isAuthenticated || !privateKey || !suiAddress) {
      return;
    }

    const user = authService.getCurrentUser();
    if (!user?.id) {
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let closed = false;

    const connect = () => {
      if (closed) return;
      const params = new URLSearchParams({ userId: user.id });
      source = new EventSource(
        `${getServerOrigin()}/api/files/completed/stream?${params.toString()}`,
      );

      source.addEventListener("open", () => {
        reconnectAttempts = 0;
      });

      source.addEventListener("snapshot", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          queueFiles(data.files || []);
        } catch (err) {
          console.error("[useBlockchainSync] Failed to parse snapshot", err);
        }
      });

      source.addEventListener("completed", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data);
          queueFiles([data]);
        } catch (err) {
          console.error(
            "[useBlockchainSync] Failed to parse completed event",
            err,
          );
        }
      });

      source.addEventListener("error", () => {
        if (source) {
          source.close();
        }
        if (closed) return;
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000);
        reconnectAttempts += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (source) {
        source.close();
      }
    };
  }, [isAuthenticated, privateKey, queueFiles, suiAddress]);

  return { syncBlockchain, isSyncing, syncStatus };
}
