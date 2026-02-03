import React, { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { authService } from "../services/authService";
import { useAuth } from "../auth/AuthContext";
import {
  deriveKeyFromRecoveryPhrase,
  generateRecoveryPhrase,
  encryptMasterKey,
  deriveKeysFromPassword,
} from "../services/keyDerivation";
import RecoveryPhraseBackup from "../components/RecoveryPhraseBackup";
import "./css/Login.css";
import "./css/Join.css";
import SlidesCarousel from "../components/SlidesCarousel";

export const Join: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setPrivateKey } = useAuth();

  const [step, setStep] = useState<number>(1);
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
  }>({ checking: false });

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [passwordInvalidOnSubmit, setPasswordInvalidOnSubmit] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [confirmPasswordError, setConfirmPasswordError] = useState(false);
  const [buttonError, setButtonError] = useState("");

  // E2E encryption state
  const [recoveryPhrase, setRecoveryPhrase] = useState<string>("");
  const [phraseConfirmed, setPhraseConfirmed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // password validation helpers
  const passwordValidation = {
    hasMinLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[^A-Za-z0-9]/.test(password),
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

  // debounce username availability check
  useEffect(() => {
    if (username.length < 3) {
      setUsernameStatus({ checking: false, available: undefined, message: "" });
      return;
    }
    let mounted = true;
    setUsernameStatus((s) => ({
      ...s,
      checking: true,
      message: "Checking availability...",
    }));
    const t = setTimeout(async () => {
      try {
        const res = await authService.checkUsernameAvailability(username);
        if (!mounted) return;
        setUsernameStatus({
          checking: false,
          available: !!res.available,
          message: res.available
            ? "Username is available"
            : res.error || "Username is taken",
        });
      } catch (err) {
        if (!mounted) return;
        setUsernameStatus({
          checking: false,
          available: false,
          message: "Could not check username",
        });
      }
    }, 500);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [username]);

  // Auto-submit when phrase is confirmed
  useEffect(() => {
    if (phraseConfirmed && step === 3 && !loading) {
      handleSubmit(new Event("submit") as any);
    }
  }, [phraseConfirmed]);

  const handleNext = () => {
    if (step === 1) {
      const trimmed = username.trim();
      if (!trimmed) {
        setButtonError("Please a username");
        return;
      }
      if (usernameStatus.available === false) {
        setButtonError("Please choose an available username");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      setButtonError("");
      setPasswordError(false);
      setConfirmPasswordError(false);

      if (!password.trim()) {
        setPasswordError(true);
        setButtonError("Please enter a password");
        return;
      }

      if (!isPasswordValid) {
        setPasswordInvalidOnSubmit(true);
        setPasswordError(true);
        setButtonError("Password requirements not met");
        return;
      }

      if (password !== confirmPassword) {
        setConfirmPasswordError(true);
        if (!confirmPassword.trim()) {
          setButtonError("Please confirm your password");
        } else {
          setButtonError("");
        }
        return;
      }

      // Generate recovery phrase for step 3
      const phrase = generateRecoveryPhrase();
      setRecoveryPhrase(phrase);
      setStep(3);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === 1 || step === 2) {
      handleNext();
      return;
    }

    // Step 3: Final submission - E2E encryption setup
    if (!phraseConfirmed) {
      setButtonError("Please confirm your recovery phrase before continuing");
      return;
    }

    setLoading(true);
    try {
      // NEW FLOW: ProtonMail-style encryption
      // 1. Derive master key from BIP39 recovery phrase
      const masterKeyHex = deriveKeyFromRecoveryPhrase(recoveryPhrase);

      // 2. Derive auth_key and enc_key from password using Argon2id + HKDF
      // Generates a random salt for this user
      const { salt, authKey, encKey } = await deriveKeysFromPassword(password);

      // 3. Encrypt master key with enc_key using AES-256-GCM
      const encryptedMasterKey = await encryptMasterKey(masterKeyHex, encKey);

      // 4. Send to server: salt, authKey (server will hash this), encryptedMasterKey
      // Server NEVER sees: password, enc_key, master_key, or recovery phrase
      const user = await authService.signup({
        username,
        authKey, // Server stores hash(authKey)
        salt, // Random salt for this user
        encryptedMasterKey,
      });
      authService.saveUser(user);

      // 5. Store master key in memory for this session
      setPrivateKey(`0x${masterKeyHex}`);

      const pendingShareId = sessionStorage.getItem("pendingShareId");
      const pendingShareReturnTo = sessionStorage.getItem(
        "pendingShareReturnTo",
      );
      const returnTo = (location.state as any)?.from || pendingShareReturnTo;

      if (pendingShareId) {
        sessionStorage.removeItem("pendingShareId");
      }
      if (pendingShareReturnTo) {
        sessionStorage.removeItem("pendingShareReturnTo");
      }

      if (returnTo) {
        navigate(returnTo);
      } else if (pendingShareId) {
        navigate(`/s/${pendingShareId}`);
      } else {
        navigate("/home");
      }
    } catch (err: any) {
      console.error("[Join] Signup failed:", err);
      setButtonError("Signup failed");
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

          <div className="form-space">
            <form noValidate onSubmit={handleSubmit} className="join-form">
              {step === 1 && (
                <div className="form-group">
                  <label className="label">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setButtonError("");
                    }}
                    className={`input ${buttonError ? "input-error" : ""}`}
                    placeholder=""
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_-]+"
                  />
                  <p className="status-line status-neutral">
                    3–30 characters · letters, numbers, – and _
                  </p>
                  {usernameStatus.message && (
                    <p
                      className={`status-line ${
                        usernameStatus.checking
                          ? "status-yellow"
                          : usernameStatus.available
                            ? "status-green"
                            : "status-red"
                      }`}
                    >
                      {usernameStatus.checking && (
                        <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                      )}
                      {usernameStatus.message}
                    </p>
                  )}
                </div>
              )}

              {step === 2 && (
                <>
                  <div className="form-group">
                    <label className="label">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordTouched(true);
                          setPasswordInvalidOnSubmit(false);
                          setPasswordError(false);
                          setButtonError("");
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
                    <label className="label">Confirm Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          setConfirmPasswordError(false);
                          setButtonError("");
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
                    {/* Password match checker */}
                    {confirmPasswordError &&
                      !passwordInvalidOnSubmit &&
                      confirmPassword.trim() !== "" && (
                        <p className="status-line status-red">
                          Passwords do not match
                        </p>
                      )}
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="form-group">
                    <label className="label">Recovery Phrase</label>
                    <RecoveryPhraseBackup
                      phrase={recoveryPhrase}
                      onConfirmed={() => setPhraseConfirmed(true)}
                      onBack={() => setStep(2)}
                    />
                  </div>
                </>
              )}

              {step === 1 && buttonError && (
                <p className="status-line status-red">{buttonError}</p>
              )}

              {step === 1 && (
                <button
                  type="submit"
                  className="btn btn-gradient liquid-btn"
                  disabled={
                    loading ||
                    usernameStatus.checking ||
                    usernameStatus.available === false
                  }
                >
                  {loading ? "Checking..." : "Next"}
                </button>
              )}

              {step === 2 && buttonError && (
                <p className="status-line status-red">{buttonError}</p>
              )}

              {step === 2 && (
                <button
                  type="submit"
                  className="btn btn-gradient liquid-btn"
                  disabled={loading}
                >
                  {loading ? "Checking..." : "Next"}
                </button>
              )}

              {step === 2 && (
                <div className="link-center back-link-wrapper">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="back-link"
                  >
                    ← Back
                  </button>
                </div>
              )}
            </form>

            <div className="link-center divider">
              <p className="label info-text">
                Already have an account?{" "}
                <Link to="/login" className="small-link">
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Carousel*/}
      <SlidesCarousel />
    </div>
  );
};
