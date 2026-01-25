import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { authService } from "../services/authService";
import { ReauthDialog } from "../components/ReauthDialog";

type AuthContextValue = {
  privateKey: string; // Derived from password during login/signup
  isAuthenticated: boolean;
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

    // Store callback directly using functional setState to avoid wrapper
    setReauthCallback(() => onSuccess || null);
    setReauthDialogOpen(true);
  };

  const handleReauthSuccess = () => {
    setReauthDialogOpen(false);

    // Execute callback after dialog closes
    const callback = reauthCallback;
    setReauthCallback(null);

    if (callback) {
      // Small delay to ensure state is fully updated
      setTimeout(() => {
        callback();
      }, 50);
    }
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
      setPrivateKey,
      clearPrivateKey,
      requestReauth,
    };
  }, [privateKey]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <ReauthDialog
        open={reauthDialogOpen}
        onClose={() => setReauthDialogOpen(false)}
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
