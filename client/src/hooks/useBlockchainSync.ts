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
    console.log('[useBlockchainSync] Sync triggered', {
      isAuthenticated,
      hasPrivateKey: !!privateKey,
      hasSuiAddress: !!suiAddress,
      suiAddress,
      isSyncing,
    });

    if (!isAuthenticated || !privateKey || !suiAddress) {
      console.log('[useBlockchainSync] Skipping sync - missing auth or keys');
      return;
    }

    if (isSyncing) {
      console.log('[useBlockchainSync] Already syncing, skipping');
      return;
    }

    setIsSyncing(true);
    setSyncStatus({ total: 0, synced: 0, failed: 0 });

    try {
      const user = authService.getCurrentUser();
      if (!user) {
        throw new Error('User not found');
      }

      console.log('[useBlockchainSync] Fetching completed files for user:', user.id);
      const response = await fetch(
        `${getServerOrigin()}/api/files/completed?userId=${user.id}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch completed files');
      }

      const { files } = await response.json();
      console.log('[useBlockchainSync] Fetched files from server:', {
        count: files?.length || 0,
        files: files?.map((f: any) => ({ filename: f.filename, fileId: f.fileId, blobId: f.blobId })),
      });
        
        if (!files || files.length === 0) {
          console.log('[useBlockchainSync] No files to sync');
          return;
        }

        console.log('[useBlockchainSync] Looking up registry for address:', suiAddress);
        let registryId = getCachedRegistryId(suiAddress);
        console.log('[useBlockchainSync] Cached registry ID:', registryId);
        
        if (!registryId) {
          console.log('[useBlockchainSync] No cached registry, searching blockchain...');
          registryId = await findUserRegistry(suiAddress);
          console.log('[useBlockchainSync] Found registry from blockchain:', registryId);
        } 

        if (!registryId) {
          console.log('[useBlockchainSync] No registry found, creating new one...');
          console.log('[useBlockchainSync] Package ID:', import.meta.env.VITE_SOVEREIGNTY_PACKAGE_ID);
          console.log('[useBlockchainSync] RPC URL:', import.meta.env.VITE_SUI_RPC_URL);
          
          const cleanHex = privateKey.replace(/^0x/, '');
          const masterKeyBytes = new Uint8Array(
            cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
          );
          
          console.log('[useBlockchainSync] Master key length:', masterKeyBytes.length);
          
          registryId = await createRegistry(
            masterKeyBytes,
            import.meta.env.VITE_SUI_EXPORTED_PRIVATE_KEY
          );
          
          console.log('[useBlockchainSync] Created new registry:', registryId);
          setCachedRegistryId(suiAddress, registryId);
        } else if (!getCachedRegistryId(suiAddress)) {
          console.log('[useBlockchainSync] Caching found registry ID');
          setCachedRegistryId(suiAddress, registryId);
        }

        console.log('[useBlockchainSync] Fetching files from blockchain registry:', registryId);
        const blockchainFiles = await getUserFiles(registryId);
        console.log('[useBlockchainSync] Files on blockchain:', {
          count: blockchainFiles.length,
          fileIds: blockchainFiles.map((f: any) => {
            const fileId = f.fileId;
            if (Array.isArray(fileId)) {
              return Buffer.from(fileId).toString('hex');
            }
            return fileId;
          }),
        });
        
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

      console.log('[useBlockchainSync] Starting file registration loop');
      for (const file of files) {
        if (file.fileId && blockchainFileIds.has(file.fileId)) {
          console.log(`[useBlockchainSync] Skipping ${file.filename} - already on blockchain`);
          continue;
        }

        try {
          if (!file.fileId) {
              console.warn(`[useBlockchainSync] Skipping ${file.filename} - no fileId in database`);
              failed++;
              continue;
            }

            console.log(`[useBlockchainSync] Registering ${file.filename}`, {
              fileId: file.fileId,
              blobId: file.blobId,
              epochs: file.epochs || 3,
            });

            await registerFile(
              masterKeyBytes,
              registryId,
              file.fileId,
              file.blobId, // Real Walrus blobId
              true,
              file.epochs || 3,
              import.meta.env.VITE_SUI_EXPORTED_PRIVATE_KEY
            );

            console.log(`[useBlockchainSync] Successfully registered ${file.filename}`);
            synced++;
            setSyncStatus({ total: files.length, synced, failed });
          } catch (err) {
            console.error(`[useBlockchainSync] Failed to register ${file.filename}:`, err);
            failed++;
            setSyncStatus({ total: files.length, synced, failed });
          }
        }
        
        console.log('[useBlockchainSync] Sync complete', { synced, failed, total: files.length });
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
