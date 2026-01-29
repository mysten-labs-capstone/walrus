import React, { useState } from "react";
import { Eye, EyeOff, AlertCircle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import { apiUrl } from "../config/api";
import {
  validateRecoveryPhrase,
  deriveKeyFromRecoveryPhrase,
  encryptRecoveryPhrase,
  deriveKeysFromPassword,
  encryptMasterKey,
} from "../services/keyDerivation";
import { useAuth } from "../auth/AuthContext";
import "./css/ForgotPassword.css";
import "./css/Login.css";

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const { setPrivateKey } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState("");
  const [userId, setUserId] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [phraseWords, setPhraseWords] = useState<string[]>(Array(12).fill(""));
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordInvalidOnSubmit, setPasswordInvalidOnSubmit] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const passwordValidation = {
    hasMinLength: newPassword.length >= 8,
    hasUppercase: /[A-Z]/.test(newPassword),
    hasLowercase: /[a-z]/.test(newPassword),
    hasNumber: /[0-9]/.test(newPassword),
    hasSpecial: /[^A-Za-z0-9]/.test(newPassword),
  };

  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  // password strength
  const getPasswordStrength = () => {
    const validations = Object.values(passwordValidation);
    const passed = validations.filter(Boolean).length;
    if (passed === 5) return { level: "Strong", color: "status-green" };
    if (passed >= 3) return { level: "Moderate", color: "status-yellow" };
    return { level: "Weak", color: "status-red" };
  };

  const submitUsername = async () => {
    setError("");
    if (!username.trim()) return setError("Please enter your username");
    if (username.trim().length < 3) return setError("Invalid username");

    setLoading(true);
    try {
      // Check if username exists and get user data
      const response = await fetch(
        apiUrl(
          `/api/auth/check-username?username=${encodeURIComponent(username.trim())}`,
        ),
      );
      const data = await response.json();

      // If username is available, it means it doesn't exist (not registered)
      if (data.available) {
        setError("User not found");
        return;
      }

      // Get user ID for password reset
      const userResponse = await fetch(
        apiUrl(
          `/api/auth/profile?username=${encodeURIComponent(username.trim())}`,
        ),
      );
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setUserId(userData.id);
      }

      // Username exists, proceed to step 2
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Unable to verify username");
    } finally {
      setLoading(false);
    }
  };

  const handleWordChange = (index: number, value: string) => {
    // Only allow single word (no spaces)
    const word = value.trim().toLowerCase().replace(/\s+/g, "");
    const newWords = [...phraseWords];
    newWords[index] = word;
    setPhraseWords(newWords);
    setError("");

    // Auto-focus next input when user types space or completes a word (3+ chars)
    if (index < 11) {
      const shouldAutoAdvance =
        value.endsWith(" ") || (word.length >= 3 && value.includes(" "));
      if (shouldAutoAdvance) {
        const nextInput = document.querySelector(
          `input[data-word-index="${index + 1}"]`,
        ) as HTMLInputElement;
        nextInput?.focus();
      }
    }
  };

  const handleWordPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const words = pastedText.trim().toLowerCase().split(/\s+/);

    if (words.length === 12) {
      setPhraseWords(words);
      setError("");
    } else {
      setError(
        `Pasted ${words.length} words, but exactly 12 words are required.`,
      );
    }
  };

  const handleWordKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !phraseWords[index] && index > 0) {
      // Focus previous input on backspace if current is empty
      const prevInput = document.querySelector(
        `input[data-word-index="${index - 1}"]`,
      ) as HTMLInputElement;
      prevInput?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      verifyRecoveryPhrase();
    }
  };

  const verifyRecoveryPhrase = async () => {
    setError("");
    const trimmedPhrase = phraseWords
      .map((w) => w.trim().toLowerCase())
      .join(" ");

    if (!validateRecoveryPhrase(trimmedPhrase)) {
      setError("Invalid recovery phrase. Please check all 12 words.");
      return;
    }

    try {
      // Derive and store the master key from recovery phrase
      const masterKey = deriveKeyFromRecoveryPhrase(trimmedPhrase);
      setPrivateKey(`0x${masterKey}`);

      // Recovery phrase verified, proceed to password reset
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Invalid recovery phrase");
    }
  };

  const resetPassword = async () => {
    setError("");
    setPasswordError(false);
    setConfirmPasswordError(false);

    if (!newPassword.trim()) {
      setPasswordError(true);
      setError("Please enter a new password");
      return;
    }

    if (!isPasswordValid) {
      setPasswordInvalidOnSubmit(true);
      setPasswordError(true);
      setError("Password requirements not met");
      return;
    }

    if (newPassword !== confirmPassword) {
      setConfirmPasswordError(true);
      if (!confirmPassword.trim()) {
        setError("Please confirm your password");
      } else {
        setError("Passwords do not match");
      }
      return;
    }

    setLoading(true);
    try {
      const trimmedPhrase = phraseWords.join(" ").trim();

      // Derive master key from recovery phrase
      const masterKey = deriveKeyFromRecoveryPhrase(trimmedPhrase);

      // Check if user has new auth system
      const saltResponse = await fetch(
        apiUrl(
          `/api/auth/get-salt?username=${encodeURIComponent(username.trim())}`,
        ),
      );
      const saltData = await saltResponse.json();
      const hasNewAuth = saltData.hasNewAuth;

      if (hasNewAuth) {
        // NEW AUTH SYSTEM: Update password with key derivation
        // Derive new keys from new password
        const newKeys = await deriveKeysFromPassword(newPassword);

        // Re-encrypt master key with new encryption key
        const newEncryptedMasterKey = await encryptMasterKey(
          masterKey,
          newKeys.encKey,
        );

        // Update server with new auth credentials
        const resetResponse = await fetch(apiUrl("/api/auth/reset-password"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId,
            newAuthKey: newKeys.authKey,
            newSalt: newKeys.salt,
            newEncryptedMasterKey,
          }),
        });

        const resetData = await resetResponse.json();
        if (!resetResponse.ok) {
          throw new Error(resetData.error || "Password reset failed");
        }
      } else {
        // OLD AUTH SYSTEM: Simple password reset
        const resetResponse = await fetch(apiUrl("/api/auth/reset-password"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: userId,
            newPassword: newPassword,
          }),
        });

        const resetData = await resetResponse.json();
        if (!resetResponse.ok) {
          throw new Error(resetData.error || "Password reset failed");
        }
      }

      // Set private key in context for immediate access
      setPrivateKey(`0x${masterKey}`);

      setSuccessMessage(
        "Password reset successful! You can now log in with your new password.",
      );
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="container">
          <div className="login-logo">
            <div className="logo-row">
              <a href="/" className="logo-mark-link">
                <img
                  src="/logo+text.svg"
                  alt="Walrus - Infinity Storage"
                  className="login-logo-img h-12 w-auto"
                />
              </a>
            </div>
          </div>

          <div className="password-heading status-neutral text-center mb-2">
            Account recovery
          </div>
          <div className="form-space">
            {successMessage && (
              <div className="success-message mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-center">
                {successMessage}
              </div>
            )}

            {step === 1 && (
              <>
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError("");
                    }}
                    className={`input ${error ? "input-error" : ""}`}
                    placeholder=""
                  />
                  {error && <p className="error-text">{error}</p>}
                </div>

                <button
                  onClick={submitUsername}
                  disabled={loading}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Please wait..." : "Continue"}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <div className="form-group">
                  <label className="label">
                    Enter your 12-word recovery phrase
                  </label>

                  <div className="recovery-phrase-grid">
                    {phraseWords.map((word, index) => (
                      <div
                        key={index}
                        className={`recovery-word-item ${error ? "has-error" : ""}`}
                      >
                        <span className="recovery-word-number">
                          {index + 1}.
                        </span>
                        <input
                          type="text"
                          value={word}
                          onChange={(e) =>
                            handleWordChange(index, e.target.value)
                          }
                          onKeyDown={(e) => handleWordKeyDown(index, e)}
                          onPaste={index === 0 ? handleWordPaste : undefined}
                          data-word-index={index}
                          className="recovery-word-input"
                          placeholder=""
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                    ))}
                  </div>
                  {error && <p className="error-text">{error}</p>}
                </div>

                <button
                  onClick={verifyRecoveryPhrase}
                  disabled={loading || phraseWords.some((w) => !w.trim())}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Please wait..." : "Verify Phrase"}
                </button>
              </>
            )}

            {step === 3 && (
              <>
                <div className="form-group">
                  <label className="label">New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordTouched(true);
                        setPasswordInvalidOnSubmit(false);
                        setPasswordError(false);
                        setError("");
                      }}
                      className={`input input-has-right-icon ${passwordError || passwordInvalidOnSubmit ? "border-red-500" : ""}`}
                      placeholder=""
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                    >
                      {showPassword ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>

                  {(() => {
                    const baseClass = "status-line";
                    const requirements = [
                      "lowercase letter",
                      "uppercase letter",
                      "number",
                      "special character",
                    ];
                    let unmet: string[] = [];
                    if (!passwordValidation.hasLowercase)
                      unmet.push("lowercase letter");
                    if (!passwordValidation.hasUppercase)
                      unmet.push("uppercase letter");
                    if (!passwordValidation.hasNumber) unmet.push("number");
                    if (!passwordValidation.hasSpecial)
                      unmet.push("special character");

                    if (isPasswordValid) {
                      const strength = getPasswordStrength();
                      return (
                        <p className={`${baseClass} status-neutral`}>
                          Strength:{" "}
                          <span className={strength.color}>
                            {strength.level}
                          </span>
                        </p>
                      );
                    }
                    return (
                      <p className={`${baseClass} status-neutral`}>
                        Must contain:{" "}
                        {(unmet.length > 0 ? unmet : requirements).join(", ")}
                      </p>
                    );
                  })()}
                </div>

                <div className="form-group">
                  <label className="label">Confirm New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setConfirmPasswordError(false);
                        setError("");
                      }}
                      className={`input input-has-right-icon ${confirmPasswordError ? "border-red-500" : ""}`}
                      placeholder=""
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="password-toggle"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="icon" />
                      ) : (
                        <Eye className="icon" />
                      )}
                    </button>
                  </div>
                  {error && <p className="error-text">{error}</p>}
                </div>

                <button
                  onClick={resetPassword}
                  disabled={loading}
                  className="btn btn-gradient liquid-btn"
                >
                  {loading ? "Please wait..." : "Reset Password"}
                </button>
              </>
            )}

            <div className="link-center forgot-link">
              <Link to="/login" className="small-link">
                Back to Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="login-right">
        <div className="login-grid-overlay" />
      </div>
    </div>
  );
};
