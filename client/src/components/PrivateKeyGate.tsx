import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Loader2, Waves, Shield, AlertCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";

// Normalize to 0x + 64 hex (lowercase)
function normalizePrivateKey(input: string): string | null {
  const trimmed = input.trim();
  const stripped = trimmed.startsWith("0x") ? trimmed.slice(2) : trimmed;
  const hex = stripped.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  return "0x" + hex;
}

export default function PrivateKeyGate() {
  const { setPrivateKey } = useAuth();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = normalizePrivateKey(draft);
    if (!normalized) {
      setError("Enter a valid 32-byte hex private key (0x + 64 hex chars).");
      return;
    }

    setSubmitting(true);
    try {
      // You could add a lightweight async check here if needed.
      setPrivateKey(normalized);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b border-blue-200/50 bg-white/80 backdrop-blur-lg dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                <Waves className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent dark:from-cyan-400 dark:to-blue-400">
                  Walrus Storage
                </h1>
                <p className="text-xs text-muted-foreground">Decentralized File Storage</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg items-center px-4 py-8">
        <Card className="w-full border-blue-200/50 bg-gradient-to-br from-white to-blue-50/30 shadow-2xl dark:from-slate-900 dark:to-slate-800">
          <CardHeader className="space-y-4">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                <KeyRound className="h-8 w-8 text-white" />
              </div>
            </div>
            <div className="text-center">
              <CardTitle className="text-2xl">Secure Access</CardTitle>
              <CardDescription className="mt-2">
                Enter your private key to access Walrus Storage
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Security Notice */}
            <div className="rounded-lg border-2 border-dashed border-blue-300/50 bg-blue-50/50 p-4 dark:border-blue-700/50 dark:bg-blue-950/20">
              <div className="flex gap-3">
                <Shield className="h-5 w-5 flex-shrink-0 text-cyan-600 dark:text-cyan-400" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Your Privacy is Protected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your private key is stored <span className="font-semibold text-cyan-600 dark:text-cyan-400">in memory only</span> for this session and never leaves your browser.
                  </p>
                </div>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <Lock className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                  Private Key
                </label>
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    inputMode="text"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pr-12 font-mono text-sm text-gray-900 transition-colors focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-cyan-400 dark:bg-white"
                    placeholder="0x..."
                    value={draft}
                    onChange={(e) => {
                      setDraft(e.target.value);
                      setError(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute inset-y-0 right-2 my-auto flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-300"
                    aria-label={show ? "Hide key" : "Show key"}
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={submitting || !draft.trim()}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                size="lg"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Continue to Walrus
                  </>
                )}
              </Button>
            </form>

            {/* Help Text */}
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-slate-900/50">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Need help?</span> Your private key should be a 64-character hexadecimal string (optionally prefixed with 0x).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="border-t border-blue-200/50 bg-white/50 backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/50">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-muted-foreground">
            Powered by Walrus & Sui • Secure Decentralized Storage
          </p>
        </div>
      </footer>
    </div>
  );
}
