import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Key, AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  validateRecoveryPhrase,
  deriveKeyFromRecoveryPhrase,
} from "../services/keyDerivation";
import { useAuth } from "../auth/AuthContext";

export default function RecoverAccount() {
  const navigate = useNavigate();
  const { setPrivateKey } = useAuth();

  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRecover = async () => {
    setError("");

    const trimmedPhrase = phrase.trim().toLowerCase();

    if (!validateRecoveryPhrase(trimmedPhrase)) {
      setError("Invalid recovery phrase. Please check and try again.");
      return;
    }

    setLoading(true);

    try {
      // Derive the master key from recovery phrase
      const masterKey = deriveKeyFromRecoveryPhrase(trimmedPhrase);

      // Store in auth context
      setPrivateKey(`0x${masterKey}`);

      // Navigate to home - user will need to log in to sync with their account
      alert(
        "Recovery successful! Your encryption key has been restored. Please log in with your username and password.",
      );
      navigate("/login");
    } catch (err: any) {
      console.error("Recovery error:", err);
      setError("Failed to recover account");
    } finally {
      setLoading(false);
    }
  };

  const handlePhraseChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPhrase(e.target.value);
    setError("");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Recover Your Account
          </CardTitle>
          <CardDescription>
            Enter your 12-word recovery phrase to restore access to your
            encrypted files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                This will restore your encryption key. You'll still need your
                username and password to log in.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Recovery Phrase</label>
            <textarea
              value={phrase}
              onChange={handlePhraseChange}
              placeholder="Enter your 12-word recovery phrase separated by spaces"
              className="w-full p-3 border rounded-lg font-mono text-sm min-h-[100px]"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-gray-500">
              Enter all 12 words separated by spaces
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleRecover}
              disabled={loading || phrase.trim().split(/\s+/).length !== 12}
              className="flex-1"
            >
              {loading ? "Recovering..." : "Recover Account"}
            </Button>
            <Button onClick={() => navigate("/login")} variant="outline">
              Cancel
            </Button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              Don't have a recovery phrase?{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-blue-600 hover:underline"
              >
                Try logging in
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
