import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, Loader2 } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md items-center">
        <div className="w-full rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center gap-3">
            <KeyRound className="h-6 w-6 text-indigo-600" />
            <h1 className="text-xl font-semibold text-gray-800">Enter Private Key</h1>
          </div>

          <p className="mb-6 text-sm text-gray-600">
            Your key is kept <span className="font-medium">in memory only</span> for this session. It never leaves your browser.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Lock className="h-4 w-4 text-indigo-600" />
                Private key (0x…)
              </span>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-indigo-500"
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
                  className="absolute inset-y-0 right-2 my-auto rounded p-1 text-gray-500 hover:text-gray-700"
                  aria-label={show ? "Hide key" : "Show key"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting ? "Verifying…" : "Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
