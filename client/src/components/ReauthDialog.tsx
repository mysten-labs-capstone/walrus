import { useState } from "react";
import { Eye, EyeOff, Key } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";
import {
  deriveKeysFromPasswordWithSalt,
  decryptMasterKey,
  decryptRecoveryPhrase,
  deriveKeyFromRecoveryPhrase,
} from "../services/keyDerivation";
import { useAuth } from "../auth/AuthContext";

interface ReauthDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReauthDialog({ open, onClose, onSuccess }: ReauthDialogProps) {
  const { setPrivateKey } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const user = authService.getCurrentUser();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!user?.username) {
        throw new Error("User session not found");
      }

      console.log("[ReauthDialog] Current user before login:", user);

      // Step 1: Get user's salt from server
      const saltResponse = await fetch(
        apiUrl(
          `/api/auth/get-salt?username=${encodeURIComponent(user.username)}`,
        ),
      );

      if (!saltResponse.ok) {
        throw new Error("Failed to retrieve authentication data");
      }

      const { salt, hasNewAuth } = await saltResponse.json();

      let authKey: string | undefined;
      let encKey: Uint8Array | undefined;

      // NEW FLOW: Use salt to derive keys
      if (salt && hasNewAuth) {
        const keys = await deriveKeysFromPasswordWithSalt(password, salt);
        authKey = keys.authKey;
        encKey = keys.encKey;
      }

      // Step 2: Verify password by attempting login
      const verifiedUser = await authService.login({
        username: user.username,
        authKey: hasNewAuth ? authKey : undefined,
        password: hasNewAuth ? undefined : password, // Use password for old accounts
      });

      console.log("[ReauthDialog] Verified user from server:", verifiedUser);
      console.log(
        "[ReauthDialog] Current user after login:",
        authService.getCurrentUser(),
      );

      // Step 3: Decrypt master key using enc_key
      if (verifiedUser.encryptedMasterKey && encKey) {
        const masterKeyHex = await decryptMasterKey(
          verifiedUser.encryptedMasterKey,
          encKey,
        );
        setPrivateKey(`0x${masterKeyHex}`);
      } else if (verifiedUser.encryptedRecoveryPhrase) {
        // BACKWARD COMPATIBILITY: old accounts
        const recoveryPhrase = await decryptRecoveryPhrase(
          verifiedUser.encryptedRecoveryPhrase,
          password,
          user.username,
        );
        const masterKey = deriveKeyFromRecoveryPhrase(recoveryPhrase);
        setPrivateKey(`0x${masterKey}`);
      } else {
        throw new Error("No encryption key found");
      }

      setPassword("");
      setError("");
      setLoading(false);

      // Only call onSuccess - let parent handle closing
      onSuccess?.();
    } catch (err: any) {
      console.error("Reauth failed:", err);
      const errorMsg = err?.message || "Invalid password";
      // Simplify error message for reauth context
      setError(
        errorMsg.includes("Invalid username or password")
          ? "Invalid password"
          : errorMsg,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-amber-600" />
            <DialogTitle>Restore Encryption Key</DialogTitle>
          </div>
          <DialogDescription>
            Your encryption key was cleared when you closed the browser tab.
            Enter your password to restore access to encrypted files.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                placeholder="Enter your password"
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !password}>
              {loading ? "Restoring..." : "Restore Key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
