import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { authService } from '../services/authService';
import { registerFile, findUserRegistry, createRegistry, getUserFiles } from '../services/suiContract';
import { getServerOrigin } from '../config/api';

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
  const [syncStatus, setSyncStatus] = useState<{
    total: number;
    synced: number;
    failed: number;
  }>({ total: 0, synced: 0, failed: 0 });

  const syncBlockchain = useCallback(async () => {
    if (!isAuthenticated || !privateKey || !suiAddress) {
      return;
    }

    if (isSyncing) {
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ total: 0, synced: 0, failed: 0 });

    try {
      const user = authService.getCurrentUser();
      if (!user) {
        throw new Error('User not found');
      }

      const response = await fetch(
        `${getServerOrigin()}/api/files/completed?userId=${user.id}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch completed files');
      }

      const { files } = await response.json();
        
        if (!files || files.length === 0) {
          return;
        }

        let registryId = getCachedRegistryId(suiAddress);        
        if (!registryId) {
          registryId = await findUserRegistry(suiAddress);
        } 

        if (!registryId) {
          console.log('[useBlockchainSync] Creating new registry...');
          const cleanHex = privateKey.replace(/^0x/, '');
          const masterKeyBytes = new Uint8Array(
            cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
          );
          registryId = await createRegistry(
            masterKeyBytes,
            import.meta.env.VITE_SUI_EXPORTED_PRIVATE_KEY
          );
          setCachedRegistryId(suiAddress, registryId);
        } else if (!getCachedRegistryId(suiAddress)) {
          setCachedRegistryId(suiAddress, registryId);
        }

        const blockchainFiles = await getUserFiles(registryId);
        const blockchainFileIds = new Set(
          blockchainFiles.map((f: any) => {
            const fileId = f.fileId;
            if (Array.isArray(fileId)) {
              return Buffer.from(fileId).toString('hex');
            }
            return fileId;
          })
        );

      const cleanHex = privateKey.replace(/^0x/, '');
      const masterKeyBytes = new Uint8Array(
        cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );

      let synced = 0;
      let failed = 0;

      for (const file of files) {
        if (file.fileId && blockchainFileIds.has(file.fileId)) {
          continue;
        }

        try {
          if (!file.fileId) {
              console.warn(`[useBlockchainSync] Skipping ${file.filename} - no fileId in database`);
              failed++;
              continue;
            }

            await registerFile(
              masterKeyBytes,
              registryId,
              file.fileId,
              file.blobId, // Real Walrus blobId
              true,
              file.epochs || 3,
              import.meta.env.VITE_SUI_EXPORTED_PRIVATE_KEY
            );

            synced++;
            setSyncStatus({ total: files.length, synced, failed });
          } catch (err) {
            console.error(`[useBlockchainSync] Failed to register ${file.filename}:`, err);
            failed++;
            setSyncStatus({ total: files.length, synced, failed });
          }
        }
    } catch (error) {
      console.error('[useBlockchainSync] Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isAuthenticated, privateKey, suiAddress, isSyncing]);

  // Auto-sync every 30 seconds to catch newly completed uploads
  useEffect(() => {
    if (!isAuthenticated || !privateKey || !suiAddress) {
      return;
    }

    const initialTimer = setTimeout(syncBlockchain, 5000);
    const interval = setInterval(syncBlockchain, 30000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isAuthenticated, privateKey, suiAddress, syncBlockchain]);

  return { syncBlockchain, isSyncing, syncStatus };
}
