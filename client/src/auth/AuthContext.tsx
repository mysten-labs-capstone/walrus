import React, { createContext, useContext, useMemo, useState, ReactNode } from "react";

type AuthContextValue = {
  privateKey: string;
  isAuthenticated: boolean;
  setPrivateKey: (key: string) => void;
  clearPrivateKey: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // In-memory only (most secure). Clears on refresh.
  const [privateKey, setPrivateKeyState] = useState<string>("");

  const value = useMemo<AuthContextValue>(() => {
    return {
      privateKey,
      isAuthenticated: !!privateKey,
      setPrivateKey: (key: string) => setPrivateKeyState(key),
      clearPrivateKey: () => setPrivateKeyState(""),
    };
  }, [privateKey]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
