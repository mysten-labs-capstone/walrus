import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { authService } from "../services/authService";

type AuthContextValue = {
  privateKey: string; // Derived from password during login/signup
  isAuthenticated: boolean;
  setPrivateKey: (key: string) => void;
  clearPrivateKey: () => void;
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
    };
  }, [privateKey]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
