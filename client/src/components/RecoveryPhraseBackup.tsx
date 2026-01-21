import { useState } from "react";
import { Copy, Check, AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

interface RecoveryPhraseBackupProps {
  phrase: string;
  onConfirmed: () => void;
}

export default function RecoveryPhraseBackup({
  phrase,
  onConfirmed,
}: RecoveryPhraseBackupProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [verificationWords, setVerificationWords] = useState<number[]>([]);
  const [userInputs, setUserInputs] = useState<Record<number, string>>({});
  const [verificationFailed, setVerificationFailed] = useState(false);

  const words = phrase.split(" ");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(phrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startVerification = () => {
    // Pick 3 random words to verify
    const indices = new Set<number>();
    while (indices.size < 3) {
      indices.add(Math.floor(Math.random() * words.length));
    }
    setVerificationWords(Array.from(indices).sort((a, b) => a - b));
    setConfirmed(true);
    setShowPhrase(false);
  };

  const handleVerification = () => {
    const correct = verificationWords.every(
      (idx) => userInputs[idx]?.toLowerCase().trim() === words[idx],
    );

    if (correct) {
      onConfirmed();
    } else {
      setVerificationFailed(true);
      setTimeout(() => {
        setVerificationFailed(false);
        setConfirmed(false);
        setUserInputs({});
      }, 2000);
    }
  };

  if (confirmed && verificationWords.length > 0) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Verify Your Recovery Phrase
          </CardTitle>
          <CardDescription>
            Enter the following words from your recovery phrase to confirm you
            saved it correctly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {verificationWords.map((wordIndex) => (
            <div key={wordIndex} className="space-y-1">
              <label className="text-sm font-medium">
                Word #{wordIndex + 1}
              </label>
              <input
                type="text"
                value={userInputs[wordIndex] || ""}
                onChange={(e) =>
                  setUserInputs({ ...userInputs, [wordIndex]: e.target.value })
                }
                className="w-full p-2 border rounded"
                placeholder="Enter word"
                autoComplete="off"
              />
            </div>
          ))}

          {verificationFailed && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
              The words don't match. Please try again.
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleVerification} className="flex-1">
              Verify
            </Button>
            <Button
              onClick={() => {
                setConfirmed(false);
                setUserInputs({});
              }}
              variant="outline"
            >
              Back
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          Save Your Recovery Phrase
        </CardTitle>
        <CardDescription>
          This 12-word phrase is the ONLY way to recover your account if you
          forget your password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <strong>Critical Security Information:</strong>
              <ul className="list-disc ml-4 mt-2 space-y-1">
                <li>Write this phrase down on paper and store it securely</li>
                <li>Never share it with anyone - not even support staff</li>
                <li>Anyone with this phrase can access your files</li>
                <li>
                  If you lose it, your encrypted files cannot be recovered
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="relative">
          <div
            className={`bg-white border-2 border-gray-300 rounded-lg p-4 ${!showPhrase ? "blur-sm select-none" : ""}`}
          >
            <div className="grid grid-cols-3 gap-3">
              {words.map((word, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 p-2 bg-gray-50 rounded"
                >
                  <span className="text-xs text-gray-500 w-6">{idx + 1}.</span>
                  <span className="font-mono font-medium">{word}</span>
                </div>
              ))}
            </div>
          </div>

          {!showPhrase && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Button onClick={() => setShowPhrase(true)} variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Click to Reveal Phrase
              </Button>
            </div>
          )}
        </div>

        {showPhrase && (
          <div className="flex gap-2">
            <Button onClick={handleCopy} variant="outline" className="flex-1">
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </>
              )}
            </Button>
            <Button onClick={() => setShowPhrase(false)} variant="outline">
              <EyeOff className="h-4 w-4 mr-2" />
              Hide
            </Button>
          </div>
        )}

        <Button
          onClick={startVerification}
          className="w-full"
          disabled={!showPhrase}
        >
          I've Saved My Recovery Phrase
        </Button>
      </CardContent>
    </Card>
  );
}
