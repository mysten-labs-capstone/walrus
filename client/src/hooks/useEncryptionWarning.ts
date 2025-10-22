// client/src/hooks/useEncryptionWarning.ts
import { useState, useCallback } from 'react';

export interface EncryptionWarning {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  blobId: string;
}

/**
 * React hook for managing encryption warnings in the UI
 * 
 * Note: This is a client-side only implementation for the browser.
 * For CLI encryption checking with keystore access, use EncryptionChecker from utils/encryptionChecker.ts
 */
export function useEncryptionWarning() {
  const [warning, setWarning] = useState<EncryptionWarning | null>(null);

  /**
   * Check if a blob might be encrypted based on storage metadata
   * This is a simplified browser version that can be extended
   */
  const checkBlobEncryption = useCallback(async (blobId: string): Promise<boolean> => {
    // In browser context, we can't access the file system keystore
    // So we check localStorage for uploaded files metadata
    try {
      const uploadedFilesStr = localStorage.getItem('walrus_uploaded_files');
      if (!uploadedFilesStr) {
        return false; // No metadata available
      }

      const uploadedFiles = JSON.parse(uploadedFilesStr);
      const fileInfo = uploadedFiles.find((f: any) => f.blobId === blobId);

      if (!fileInfo) {
        // File not found in local storage - could be someone else's upload
        setWarning({
          type: 'warning',
          title: 'Unknown Blob',
          message: 'This blob was not uploaded from this browser. It may be encrypted. Download at your own risk.',
          blobId,
        });
        return false;
      }

      // Check if file metadata indicates encryption
      if (fileInfo.encrypted === true) {
        setWarning({
          type: 'error',
          title: 'Encrypted Blob',
          message: 'This blob is encrypted. The web UI does not support client-side decryption yet. Please use the CLI to download encrypted files.',
          blobId,
        });
        return true; // Is encrypted
      }

      // File is known and not encrypted
      setWarning(null);
      return false;

    } catch (error) {
      console.error('Error checking blob encryption:', error);
      setWarning({
        type: 'info',
        title: 'Unable to Verify Encryption',
        message: 'Could not verify if this blob is encrypted. Proceeding with download.',
        blobId,
      });
      return false;
    }
  }, []);

  /**
   * Show a warning that the blob is encrypted
   */
  const showEncryptedWarning = useCallback((blobId: string) => {
    setWarning({
      type: 'error',
      title: '🔒 Encrypted Blob - Cannot Decrypt',
      message: `This blob (${blobId.slice(0, 8)}...) is encrypted. The web UI does not support decryption. Please use the CLI:\n\n` +
        `npx tsx src/scripts/index.ts download ${blobId}\n\n` +
        `Or check if you have the key:\n` +
        `npx tsx src/scripts/index.ts check ${blobId}`,
      blobId,
    });
  }, []);

  /**
   * Show a warning that the blob might not belong to the user
   */
  const showUnknownBlobWarning = useCallback((blobId: string) => {
    setWarning({
      type: 'warning',
      title: '⚠️ Unknown Blob',
      message: `This blob was not uploaded from this browser. It may belong to someone else or be encrypted. ` +
        `If it's encrypted and you don't have the key, you won't be able to decrypt it.`,
      blobId,
    });
  }, []);

  /**
   * Show success message that blob can be accessed
   */
  const showSuccessMessage = useCallback((blobId: string) => {
    setWarning({
      type: 'success',
      title: '✅ Blob Available',
      message: 'This blob is accessible and not encrypted. You can download it safely.',
      blobId,
    });
  }, []);

  /**
   * Clear the current warning
   */
  const clearWarning = useCallback(() => {
    setWarning(null);
  }, []);

  return {
    warning,
    checkBlobEncryption,
    showEncryptedWarning,
    showUnknownBlobWarning,
    showSuccessMessage,
    clearWarning,
  };
}
