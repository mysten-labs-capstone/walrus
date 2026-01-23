import { useState } from "react";
import { Info } from "lucide-react";
import "../pages/css/Login.css";

interface RecoveryPhraseBackupProps {
  phrase: string;
  onConfirmed: () => void;
  onBack?: () => void;
}

export default function RecoveryPhraseBackup({
  phrase,
  onConfirmed,
  onBack,
}: RecoveryPhraseBackupProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [verificationWords, setVerificationWords] = useState<number[]>([]);
  const [userInputs, setUserInputs] = useState<Record<number, string>>({});
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const words = phrase.split(" ");

  const startVerification = () => {
    // Pick 3 random words to verify
    const indices = new Set<number>();
    while (indices.size < 3) {
      indices.add(Math.floor(Math.random() * words.length));
    }
    setVerificationWords(Array.from(indices).sort((a, b) => a - b));
    setConfirmed(true);
  };

  const handleVerification = () => {
    const correct = verificationWords.every(
      (idx) => userInputs[idx]?.toLowerCase().trim() === words[idx],
    );

    if (correct) {
      setIsCreating(true);
      onConfirmed();
    } else {
      setVerificationFailed(true);
    }
  };

  if (confirmed && verificationWords.length > 0) {
    return (
      <div className="space-y-4">
        <div className="info-box mb-3">
          <div className="flex gap-2">
            <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-300">
              Enter the following words from your recovery phrase to confirm you
              saved it correctly.
            </p>
          </div>
        </div>

        {verificationWords.map((wordIndex) => (
          <div key={wordIndex} className="form-group">
            <label className="label">Word #{wordIndex + 1}</label>
            <input
              type="text"
              value={userInputs[wordIndex] || ""}
              onChange={(e) =>
                setUserInputs({ ...userInputs, [wordIndex]: e.target.value })
              }
              className="input"
              placeholder=""
              autoComplete="off"
            />
          </div>
        ))}

        {verificationFailed && (
          <p className="status-line status-red">
            The words don't match. Please try again.
          </p>
        )}

        <button
          onClick={handleVerification}
          className="btn btn-gradient liquid-btn w-full"
          disabled={isCreating}
        >
          {isCreating ? "Creating Account..." : "Create Account"}
        </button>

        <div className="link-center back-link-wrapper">
          <button
            type="button"
            onClick={() => {
              setConfirmed(false);
              setUserInputs({});
              setVerificationFailed(false);
            }}
            className="back-link"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="info-box mb-3">
        <div className="flex gap-2">
          <Info className="h-4 w-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-300">
            <strong className="block mb-2">
              This 12-word phrase is the ONLY way to recover your account.
            </strong>
            <ul className="list-disc ml-4 space-y-1">
              <li>Write this phrase down on paper and store it securely</li>
              <li>Never share it with anyone - not even support staff</li>
              <li>Anyone with this phrase can access your files</li>
              <li>If you lose it, your encrypted files cannot be recovered</li>
            </ul>
          </div>
        </div>
      </div>

      <div
        className="recovery-phrase-grid"
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.5rem",
          marginBottom: "1rem",
        }}
      >
        {words.map((word, idx) => (
          <div key={idx} className="recovery-word-item">
            <span className="recovery-word-number">{idx + 1}.</span>
            <span
              className="recovery-word-input"
              style={{ color: "#e5e7eb", fontFamily: "monospace" }}
            >
              {word}
            </span>
          </div>
        ))}
      </div>

      <button
        onClick={startVerification}
        className="btn btn-gradient liquid-btn w-full"
      >
        Continue
      </button>

      {onBack && (
        <div className="link-center back-link-wrapper">
          <button type="button" onClick={onBack} className="back-link">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
