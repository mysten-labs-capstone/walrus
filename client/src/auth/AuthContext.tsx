import React, { createContext, useContext, useMemo, useState, ReactNode, useEffect, useRef } from "react";
import { authService } from "../services/authService";
import { ReauthDialog } from "../components/ReauthDialog";
import { getSuiAddressFromMasterKey } from "../services/crypto";

type AuthContextValue = {
  privateKey: string; // Derived from password during login/signup
  isAuthenticated: boolean;
  suiAddress: string | null; // derived from SHA-256(masterKey, domain-identifier)
  setPrivateKey: (key: string) => void;
  clearPrivateKey: () => void;
  requestReauth: (onSuccess?: () => void) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "walrus_session_key";

export function AuthProvider({ children }: { children: ReactNode }) {
  // Persist key in sessionStorage (cleared when tab closes, survives refresh)
  // Key is derived from password, never stored on server.
  const [privateKey, setPrivateKeyState] = useState<string>(() => {
    // Initialize from sessionStorage on mount
    try {
      const storedKey = sessionStorage.getItem(STORAGE_KEY) || "";
      // Clear the key if user is not logged in
      const user = authService.getCurrentUser();
      if (storedKey && !user) {
        sessionStorage.removeItem(STORAGE_KEY);
        return "";
      }
      return storedKey;
    } catch {
      return "";
    }
  });

  const [suiAddress, setSuiAddress] = useState<string | null>(null);
  useEffect(() => {
    if (privateKey) {
      try {
        // Convert hex string to Uint8Array (remove 0x prefix if present) - this is what costed me hours, MAKE SURE THIS STAYS
        const cleanHex = privateKey.replace(/^0x/, '');
        const keyBytes = new Uint8Array(
          cleanHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
        );

        if (keyBytes.length !== 32) {
          console.error('[AuthContext] Invalid key length:', keyBytes.length, 'expected 32');
          setSuiAddress(null);
          return;
        }

        const address = getSuiAddressFromMasterKey(keyBytes);
        setSuiAddress(address);
      } catch (err) {
        console.error("Failed to derive Sui address:", err);
        setSuiAddress(null);
      }
    } else {
      setSuiAddress(null);
    }
  }, [privateKey]);

  const [reauthDialogOpen, setReauthDialogOpen] = useState(false);
  const [reauthCallback, setReauthCallback] = useState<(() => void) | null>(
    null,
  );

  const requestReauth = (onSuccess?: () => void) => {
    // Don't show dialog if key already exists
    if (privateKey) {
      // Key already present, just execute callback immediately
      if (onSuccess) {
        setTimeout(() => onSuccess(), 50);
      }
      return;
    }

    // Prevent multiple simultaneous reauth requests
    if (reauthDialogOpen) {
      return;
    }

    // Store callback using functional setState to preserve the function reference
    if (onSuccess) {
      setReauthCallback(() => onSuccess);
    }
    setReauthDialogOpen(true);
  };

  const handleReauthSuccess = () => {
    setReauthDialogOpen(false);

    // Execute callback after dialog closes
    const callback = reauthCallback;
    setReauthCallback(null);

    if (callback) {
      // Wait longer for privateKey state to fully update and propagate through React context
      // This ensures that when the callback runs and checks privateKey again, it will see the new value
      setTimeout(() => {
        callback();
      }, 300);
    }
  };

  const handleReauthClose = () => {
    setReauthDialogOpen(false);
    // Clear callback when dialog is cancelled
    setReauthCallback(null);
  };

  const setPrivateKey = (key: string) => {
    setPrivateKeyState(key);
    try {
      if (key) {
        sessionStorage.setItem(STORAGE_KEY, key);
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.error("Failed to persist encryption key:", err);
    }
  };

  const clearPrivateKey = () => {
    setPrivateKeyState("");
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Failed to clear encryption key:", err);
    }
  };

  const value = useMemo<AuthContextValue>(() => {
    return {
      privateKey,
      isAuthenticated: !!privateKey,
      suiAddress,
      setPrivateKey,
      clearPrivateKey,
      requestReauth,
    };
  }, [privateKey, suiAddress]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ReauthDialog
        open={reauthDialogOpen}
        onClose={handleReauthClose}
        onSuccess={handleReauthSuccess}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
